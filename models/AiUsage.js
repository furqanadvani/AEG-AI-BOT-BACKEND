const mongoose = require("mongoose");

/** AI usage counter: har din ka aur har mahine ka ek document (atomic $inc) */
const aiUsageSchema = new mongoose.Schema(
  {
    period: { type: String, enum: ["day", "month"], required: true },
    key: { type: String, required: true }, // 2026-10-13 ya 2026-10
    requests: { type: Number, default: 0 },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    failures: { type: Number, default: 0 },
    blocked: { type: Number, default: 0 }, // limit ki wajah se ruki calls
    byPurpose: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);

aiUsageSchema.index({ period: 1, key: 1 }, { unique: true });

module.exports = mongoose.model("AiUsage", aiUsageSchema);
