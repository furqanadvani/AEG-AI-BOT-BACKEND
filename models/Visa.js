const mongoose = require("mongoose");

const visaSchema = new mongoose.Schema(
    {
        visaName: {
            type: String,
            required: true,
            trim: true,
        },

        visaType: {
            type: String,
            required: true,
            trim: true,
        },

        rate: {
            type: Number,
            required: true,
            min: 0,
        },

        currency: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Currency",
            required: true,
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

const Visa = mongoose.model("Visa", visaSchema);

module.exports = Visa;