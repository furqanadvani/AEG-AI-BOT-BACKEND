const mongoose = require("mongoose");

const exchangeRateSchema = new mongoose.Schema(
  {
    toCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    fromRate: {
      type: Number,
      required: true,
      min: 0,
    },

    toRate: {
      type: Number,
      required: true,
      min: 0,
    },

    effectiveFrom: {
      type: Date,
      default: Date.now,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: true,
  }
);

const currencySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    symbol: {
      type: String,
      required: true,
      trim: true,
    },

    decimalPlaces: {
      type: Number,
      default: 2,
      min: 0,
      max: 6,
    },

    exchangeRates: {
      type: [exchangeRateSchema],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Currency", currencySchema);