const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true }, // AI_LIMIT_REACHED, AI_LIMIT_WARNING, NEW_LEAD, HUMAN_REQUEST, INTEGRATION_ERROR
    level: { type: String, enum: ["info", "success", "warning", "error"], default: "info" },
    title: { type: String, required: true, trim: true },
    message: { type: String, default: "" },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    dedupeKey: { type: String, default: undefined },
    module: { type: String, default: null }, // ACL module: sirf unhe dikhe jin ke paas VIEW ho
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Notification", notificationSchema);
