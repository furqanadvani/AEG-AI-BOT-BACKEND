const mongoose = require("mongoose");

/** Countries tab: Country | Aliases | Cities | Active | Notes  (Active = No -> bot mana karta hai) */
const countrySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    aliases: { type: [String], default: [] },
    cities: { type: [String], default: [] },
    notes: { type: String, default: "", trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Country", countrySchema);
