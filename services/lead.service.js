const Lead = require("../models/Lead");
const Agent = require("../models/Agent");
const AppError = require("../utils/AppError");
const { createCrudService, assertId } = require("../utils/crudFactory");
const settingService = require("./setting.service");
const customerService = require("./customer.service");
const { normalizePhone } = require("../utils/phone");
const { DEFAULT_LEAD_STATUSES } = require("../constants/workflow");

const newLeadId = () => "AEG-" + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 5).toUpperCase();

const statuses = async () => {
  const list = await settingService.getList("LeadStatuses");
  const out = list.length ? [...list] : [...DEFAULT_LEAD_STATUSES];
  // V19: bot "refused demand" leads isi status se banata hai: purani DB settings mein na ho tab bhi list mein rahe (edit fail na ho)
  const refused = String((await settingService.getRaw("RefusedLeadStatus")) || "Not processed").trim();
  if (refused && !out.includes(refused)) out.push(refused);
  return out;
};

const crud = createCrudService(Lead, {
  entity: "Lead",
  searchFields: ["leadId", "fullName", "whatsapp", "country", "visaType", "summary"],
  filterFields: ["status", "country", "visaType", "assignedAgent", "channel", "customer", "agent", "crmSync.status"],
  populate: [{ path: "customer", select: "name phone email" }, { path: "agent", select: "name email" }],
  writableFields: ["status", "assignedAgent", "agent", "fullName", "whatsapp", "country", "visaType", "travelDate", "duration", "travellers", "relationship", "bankStatement", "cityToStay", "otherDetails", "openQuestions", "summary", "data", "language", "isActive"],
  beforeCreate: async (data) => {
    // Staff ne manual lead banaya: customer profile se link (ya EK dafa banao)
    if (!data.whatsapp || !data.fullName) throw AppError.badRequest("fullName and whatsapp are required");
    data.whatsapp = normalizePhone(data.whatsapp) || data.whatsapp;
    const c = await customerService.upsertFromBot({ name: data.fullName, phone: data.whatsapp, channel: "api" });
    if (c) await customerService.touchLead(c._id);
    if (data.status && !(await statuses()).includes(data.status)) throw AppError.badRequest("Invalid lead status");
    return { ...data, leadId: newLeadId(), customer: c?._id || null, channel: "api" };
  },
  beforeUpdate: async (data) => {
    if (data.status && !(await statuses()).includes(data.status)) throw AppError.badRequest(`Invalid status. Allowed: ${(await statuses()).join(", ")}`);
    return data;
  },
});

const updateStatus = async (id, status, user) => {
  if (!status) throw AppError.badRequest("status is required");
  return crud.update(id, { status }, { user });
};

const assign = async (id, agentId, user) => {
  assertId(agentId);
  const agent = await Agent.findOne({ _id: agentId, isActive: true }).lean();
  if (!agent) throw AppError.notFound("Agent not found or inactive");
  return crud.update(id, { agent: agent._id, assignedAgent: agent.name }, { user });
};

const addNote = async (id, text, user) => {
  assertId(id);
  if (!String(text || "").trim()) throw AppError.badRequest("text is required");
  const r = await Lead.updateOne({ _id: id }, { $push: { notes: { text: String(text).trim().slice(0, 2000), by: user?.id || null } } });
  if (!r.matchedCount) throw AppError.notFound("Lead not found");
  return crud.getById(id);
};

const getByLeadId = async (leadId) => {
  const l = await Lead.findOne({ leadId: String(leadId).toUpperCase() }).populate("customer", "name phone email").lean();
  if (!l) throw AppError.notFound("Lead not found");
  return l;
};

const resyncCrm = async (id) => {
  assertId(id);
  return require("./workflow.hooks").syncLeadToCrm(id);
};

module.exports = { ...crud, updateStatus, assign, addNote, getByLeadId, resyncCrm, statuses };
