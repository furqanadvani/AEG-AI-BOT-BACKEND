const mongoose = require("mongoose");

const roomRateSchema = new mongoose.Schema(
    {
        occupancy: {
            type: String,
            enum: ["single", "double", "triple", "quad", "quint"],
            required: true,
            lowercase: true,
            trim: true,
        },

        rate: {
            type: Number,
            required: true,
            min: 0,
        },
    },
    {
        _id: false,
    }
);

const roomCategorySchema = new mongoose.Schema(
    {
        categoryName: {
            type: String,
            required: true,
            trim: true,
        },

        rates: {
            type: [roomRateSchema],
            default: [],
        },
    },
    {
        _id: true,
    }
);

const hotelSchema = new mongoose.Schema(
    {
        hotelName: {
            type: String,
            required: true,
            trim: true,
        },

        city: {
            type: String,
            required: true,
            trim: true,
        },

        country: {
            type: String,
            required: true,
            trim: true,
        },

        currency: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Currency",
            required: true,
        },

        roomCategories: {
            type: [roomCategorySchema],
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

const Hotel = mongoose.model("Hotel", hotelSchema);

module.exports = Hotel;