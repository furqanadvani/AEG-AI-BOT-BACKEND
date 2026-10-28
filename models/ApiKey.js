const mongoose = require("mongoose");

/**
 * Secure channel for machines (n8n, CRM, AI agent, WhatsApp bridge).
 * Raw key sirf banate waqt ek dafa dikhayi jati hai; DB mein sirf hash.
 * permissions ka format Role.permissions jaisa: [{ key: "LEADS", access: ["VIEW","CREATE"] }]
 */
const apiKeySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    prefix: { type: String, required: true, index: true }, // dikhane ke liye: aeg_live_ab12
    keyHash: { type: String, required: true, unique: true, select: false },
    permissions: [
      {
        _id: false,
        key: { type: String, required: true, trim: true },
        access: { type: [String], default: [] },
      },
    ],
    ipAllowlist: { type: [String], default: [] },
    expiresAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    lastUsedIp: { type: String, default: null },
    usageCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ApiKey", apiKeySchema);
