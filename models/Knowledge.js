const mongoose = require("mongoose");

/** Knowledge tab: Country | VisaType | Topic | Info | Active */
const knowledgeSchema = new mongoose.Schema(
  {
    country: { type: String, default: "ALL", trim: true },
    visaType: { type: String, default: "ALL", trim: true },
    topic: { type: String, required: true, trim: true },
    info: { type: String, required: true, trim: true, maxlength: 4000 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

knowledgeSchema.index({ topic: "text", info: "text" });

module.exports = mongoose.model("Knowledge", knowledgeSchema);
