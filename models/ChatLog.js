const mongoose = require("mongoose");

/** Logs tab: har turn ka record (tokens, latency, intent...) */
const chatLogSchema = new mongoose.Schema(
  {
    sessionId: { type: String, index: true },
    channel: { type: String, default: "web" },
    language: String,
    intent: String,
    next: String,
    skipReason: String,
    ai1In: { type: Number, default: 0 },
    ai1Out: { type: Number, default: 0 },
    ai2In: { type: Number, default: 0 },
    ai2Out: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    latencyMs: { type: Number, default: 0 },
    feedback: String,
    replyAI: String,
    message: String,
    reply: String,
    aiLimited: { type: Boolean, default: false },
    aiError: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Purane logs khud mit jayen (default 180 din)
chatLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: (Number(process.env.LOG_RETENTION_DAYS) || 180) * 86400 });

module.exports = mongoose.model("ChatLog", chatLogSchema);