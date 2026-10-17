const mongoose = require("mongoose");

/** Leads tab -> Mongo. Customer ka sirf reference; snapshot fields history ke liye rehte hain */
const leadSchema = new mongoose.Schema(
  {
    leadId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    status: { type: String, default: "New", trim: true, index: true },
    assignedAgent: { type: String, default: "Unassigned", trim: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", default: null },

    fullName: { type: String, default: "", trim: true },
    whatsapp: { type: String, default: "", trim: true, index: true },
    country: { type: String, default: "", trim: true },
    visaType: { type: String, default: "", trim: true },
    travelDate: { type: String, default: "" },
    duration: { type: String, default: "" },
    travellers: { type: String, default: "" },
    relationship: { type: String, default: "" },
    bankStatement: { type: String, default: "" },
    cityToStay: { type: String, default: "" },
    otherDetails: { type: String, default: "" },
    openQuestions: { type: String, default: "" },
    summary: { type: String, default: "" },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }, // bot ka poora collected data
    language: { type: String, default: "" },
    sessionId: { type: String, default: "", index: true },
    channel: { type: String, default: "web" },

    notes: [
      {
        text: { type: String, trim: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        at: { type: Date, default: Date.now },
      },
    ],

    crmSync: {
      status: { type: String, enum: ["pending", "synced", "failed", "skipped"], default: "skipped" },
      crmId: { type: String, default: null },
      syncedAt: { type: Date, default: null },
      error: { type: String, default: null },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

leadSchema.index({ country: 1, visaType: 1, status: 1 });

module.exports = mongoose.model("Lead", leadSchema);
