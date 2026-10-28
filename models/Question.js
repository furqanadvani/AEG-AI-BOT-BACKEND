const mongoose = require("mongoose");
const { QUESTION_TYPES } = require("../constants/workflow");

/** Questions tab: Country | VisaType | Field | Label | WhatToAsk | WhyWeAsk | Type | Options | Required | AskWhen | Order | Active */
const questionSchema = new mongoose.Schema(
  {
    country: { type: String, default: "ALL", trim: true },
    visaType: { type: String, default: "ALL", trim: true },
    field: { type: String, required: true, trim: true, match: /^[A-Za-z][A-Za-z0-9_]*$/ },
    label: { type: String, default: "", trim: true },
    whatToAsk: { type: String, default: "", trim: true },
    whyWeAsk: { type: String, default: "", trim: true },
    type: { type: String, enum: QUESTION_TYPES, default: "text", lowercase: true },
    options: { type: String, default: "", trim: true }, // "Yes | No" ya "1-20"
    required: { type: Boolean, default: true },
    askWhen: { type: String, default: "", trim: true }, // e.g. travellers > 1
    order: { type: Number, default: 999 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

questionSchema.index({ country: 1, visaType: 1, field: 1 }, { unique: true });

module.exports = mongoose.model("Question", questionSchema);
