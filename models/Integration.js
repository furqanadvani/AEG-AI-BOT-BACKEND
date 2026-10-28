const mongoose = require("mongoose");
const { INTEGRATION_TYPES } = require("../constants/workflow");

/**
 * External services ki config DB mein (frontend se manage):
 *  ai: groq/openai | crm: internal CRM | whatsapp: meta cloud | email: smtp
 * `secrets` encrypted hote hain (utils/crypto), API response mein masked.
 */
const integrationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: INTEGRATION_TYPES, required: true, unique: true },
    provider: { type: String, required: true, trim: true }, // groq | openai | custom_crm | meta_cloud | smtp
    name: { type: String, default: "", trim: true },
    config: { type: mongoose.Schema.Types.Mixed, default: {} }, // baseUrl, phoneNumberId, endpoints...
    secrets: { type: mongoose.Schema.Types.Mixed, default: {}, select: false }, // { apiKey: "v1:..." }
    isEnabled: { type: Boolean, default: false },
    lastTestAt: { type: Date, default: null },
    lastTestOk: { type: Boolean, default: null },
    lastError: { type: String, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Integration", integrationSchema);
