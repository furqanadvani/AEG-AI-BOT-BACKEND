const mongoose = require("mongoose");
const { QUERY_TYPES, QUERY_STATUSES } = require("../constants/workflow");

/** Queries tab: UNANSWERED / HUMAN / LOST ... */
const querySchema = new mongoose.Schema(
  {
    queryId: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: QUERY_TYPES, default: "UNANSWERED", index: true },
    question: { type: String, default: "", maxlength: 2000 },
    answer: { type: String, default: "" },
    country: { type: String, default: "" },
    visaType: { type: String, default: "" },
    fullName: { type: String, default: "" },
    whatsapp: { type: String, default: "", index: true },
    assignedAgent: { type: String, default: "" },
    status: { type: String, enum: QUERY_STATUSES, default: "Open", index: true },
    sessionId: { type: String, default: "" },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null },
    answeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    answeredAt: { type: Date, default: null },
    addToKnowledge: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Query", querySchema);
