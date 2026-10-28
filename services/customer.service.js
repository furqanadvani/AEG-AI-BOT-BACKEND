/**
 * Customer Profile: ek customer = ek profile (phone unique). Bot aur staff dono yahi use karte hain.
 * Lead / Query / Session mein sirf reference.
 */
const Customer = require("../models/Customer");
const Lead = require("../models/Lead");
const Query = require("../models/Query");
const Session = require("../models/Session");
const AppError = require("../utils/AppError");
const { createCrudService, assertId } = require("../utils/crudFactory");
const { normalizePhone } = require("../utils/phone");

const WRITABLE = ["name", "email", "phone", "whatsapp", "alternatePhones", "cnic", "passportNumber", "city", "preferredLanguage", "source", "tags", "notes", "extra", "isActive"];

const crud = createCrudService(Customer, {
  entity: "Customer",
  searchFields: ["name", "phone", "whatsapp", "email", "cnic", "passportNumber"],
  filterFields: ["source", "tags", "city"],
  writableFields: WRITABLE,
  beforeCreate: async (data) => {
    const phone = normalizePhone(data.phone) || String(data.phone || "").trim();
    if (!phone) throw AppError.badRequest("Customer phone is required");
    const existing = await Customer.findOne({ phone }).select("_id name").lean();
    if (existing) throw new AppError(`Customer already exists with this phone (${existing.name})`, 409, "CUSTOMER_EXISTS", { customerId: existing._id });
    return { ...data, phone, whatsapp: data.whatsapp ? normalizePhone(data.whatsapp) || data.whatsapp : phone, source: data.source || "walk-in" };
  },
  beforeUpdate: async (data, doc) => {
    if (data.phone !== undefined) {
      const phone = normalizePhone(data.phone) || String(data.phone).trim();
      const dup = await Customer.findOne({ phone, _id: { $ne: doc._id } }).select("_id").lean();
      if (dup) throw AppError.conflict("Another customer already has this phone");
      data.phone = phone;
    }
    return data;
  },
});

/** Bot ke liye: phone se dhoondo, na ho to EK dafa banao. Kabhi throw nahi (bot rukna nahi chahiye) */
const upsertFromBot = async ({ name, phone, language, channel, sessionId }) => {
  const p = normalizePhone(phone) || String(phone || "").trim();
  if (!p) return null;
  try {
    return await Customer.findOneAndUpdate(
      { phone: p },
      {
        $setOnInsert: { name: String(name || "").trim() || "Unknown", phone: p, whatsapp: p, source: channel === "whatsapp" ? "whatsapp" : "chatbot" },
        $set: { lastSeenAt: new Date(), ...(language ? { preferredLanguage: language } : {}) },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean();
  } catch (e) {
    if (e.code === 11000) return Customer.findOne({ phone: p }).lean(); // race: dusri request ne bana diya
    console.error("Customer upsert failed:", e.message, sessionId);
    return null;
  }
};

const touchLead = (id) => Customer.updateOne({ _id: id }, { $inc: { leadsCount: 1 }, $set: { lastLeadAt: new Date() } });
const touchQuery = (id) => Customer.updateOne({ _id: id }, { $inc: { queriesCount: 1 } });

/** Poora profile: customer + uske saare leads, queries, sessions */
const getProfile = async (id) => {
  assertId(id);
  const customer = await Customer.findById(id).lean();
  if (!customer) throw AppError.notFound("Customer not found");
  const [leads, queries, sessions] = await Promise.all([
    Lead.find({ customer: id }).sort({ createdAt: -1 }).limit(100).lean(),
    Query.find({ customer: id }).sort({ createdAt: -1 }).limit(100).lean(),
    Session.find({ customer: id }).select("sessionId channel stage language messagesCount lastMessageAt humanTakeover createdAt").sort({ lastMessageAt: -1 }).limit(20).lean(),
  ]);
  return { customer, leads, queries, sessions };
};

const findByPhone = async (phone) => {
  const p = normalizePhone(phone) || String(phone || "").trim();
  const c = await Customer.findOne({ $or: [{ phone: p }, { whatsapp: p }, { alternatePhones: p }] }).lean();
  if (!c) throw AppError.notFound("Customer not found");
  return c;
};

module.exports = { ...crud, upsertFromBot, touchLead, touchQuery, getProfile, findByPhone };
