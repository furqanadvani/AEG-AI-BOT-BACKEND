const mongoose = require("mongoose");
const { SETTING_TYPES } = require("../constants/workflow");

/** Settings tab (Key / Value). `group` sirf frontend par grouping ke liye */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, match: /^[A-Za-z][A-Za-z0-9_]*$/ },
    value: { type: String, default: "", trim: true },
    type: { type: String, enum: SETTING_TYPES, default: "string" },
    group: { type: String, default: "general", trim: true, lowercase: true },
    label: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Setting", settingSchema);
