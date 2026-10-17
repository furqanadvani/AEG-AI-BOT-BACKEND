const mongoose = require("mongoose");
const { CUSTOMER_SOURCES } = require("../constants/workflow");

/**
 * Customer Profile: EK hi baar banta hai (phone = unique pehchaan, +92 format).
 * Har Lead / Query / Session mein sirf iska reference (customer: ObjectId) hota hai.
 */
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Customer name is required"], trim: true },
    email: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, required: [true, "Customer phone is required"], unique: true, trim: true },
    whatsapp: { type: String, trim: true, default: null },
    alternatePhones: { type: [String], default: [] },
    cnic: { type: String, trim: true, default: null },
    passportNumber: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: "" },
    preferredLanguage: { type: String, trim: true, default: "" },
    source: { type: String, enum: CUSTOMER_SOURCES, default: "chatbot" },
    tags: { type: [String], default: [] },
    notes: { type: String, default: "" },
    extra: { type: mongoose.Schema.Types.Mixed, default: {} }, // dynamic fields

    // Stats (denormalised, list/filter ke liye)
    leadsCount: { type: Number, default: 0 },
    queriesCount: { type: Number, default: 0 },
    lastLeadAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null },

    // CRM sync
    crmId: { type: String, default: null, index: true },
    crmSyncedAt: { type: Date, default: null },

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

customerSchema.index({ name: "text", phone: "text", email: "text" });

module.exports = mongoose.model("Customer", customerSchema);
