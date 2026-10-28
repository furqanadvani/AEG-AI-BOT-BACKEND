const mongoose = require("mongoose");
const { VISA_ACTIONS } = require("../constants/workflow");

/**
 * VisaTypes tab: Country (ya ALL) | VisaType | Aliases | Action (Apply/Refuse/Forward) | CustomerMessage
 * Note: models/Visa.js (rates/currency) alag cheez hai, woh waisa hi hai.
 */
const visaTypeSchema = new mongoose.Schema(
  {
    country: { type: String, default: "ALL", trim: true },
    name: { type: String, required: true, trim: true },
    aliases: { type: [String], default: [] },
    action: { type: String, enum: VISA_ACTIONS, default: "Apply" },
    customerMessage: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

visaTypeSchema.index({ country: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("VisaType", visaTypeSchema);
