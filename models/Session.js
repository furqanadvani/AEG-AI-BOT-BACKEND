const mongoose = require("mongoose");

/** Sessions tab: bot ki memory (state + history) har customer/session ke liye */
const sessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, trim: true },
    channel: { type: String, default: "web" },
    stage: { type: String, default: "collecting", index: true },
    language: { type: String, default: "" },
    state: { type: mongoose.Schema.Types.Mixed, default: {} },
    history: { type: mongoose.Schema.Types.Mixed, default: [] }, // engine ki short memory (aakhri 16)
    // Poori baat-cheet (full text + time + bot info). Admin panel ka "view chat" isi se
    transcript: [
      {
        _id: false,
        role: { type: String, enum: ["user", "assistant", "agent", "system"], required: true },
        text: { type: String, default: "" },
        at: { type: Date, default: Date.now },
        meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
      },
    ],
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    aiCalls: { type: Number, default: 0 },
    messagesCount: { type: Number, default: 0 },
    humanTakeover: { type: Boolean, default: false }, // true = bot chup, agent baat karega
    // V19: multi-server lock (ek session ke messages line se). Khud expire hota hai, phansta nahi
    lockUntil: { type: Date, default: null },
    lockToken: { type: String, default: null },
    lastMessageAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, minimize: false }
);

// Admin list / customer profile ke aam filters
sessionSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model("Session", sessionSchema);
