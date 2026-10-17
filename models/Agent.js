const mongoose = require("mongoose");

/** Agents tab: Country | AgentName | AgentEmail | Active. Optional: system member se link */
const agentSchema = new mongoose.Schema(
  {
    country: { type: String, default: "ALL", trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: "", trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    priority: { type: Number, default: 0 }, // zyada = pehle
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

agentSchema.index({ country: 1, email: 1 }, { unique: true });

module.exports = mongoose.model("Agent", agentSchema);
