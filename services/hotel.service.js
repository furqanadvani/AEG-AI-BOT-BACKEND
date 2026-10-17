const Hotel = require("../models/Hotel"); // FIX: pehle galti se Visa model import tha
const Currency = require("../models/Currency");

const populateCurrency = (query) => {
    return query.populate(
        "currency",
        "code name symbol decimalPlaces exchangeRates"
    );
};

const validateCurrency = async (currency) => {
    const currencyExists = await Currency.findOne({
        _id: currency,
        isActive: true,
    });

    if (!currencyExists) {
        throw new Error("Currency not found or inactive");
    }

    return currencyExists;
};

const createHotel = async (payload) => {
    const {
        hotelName,
        city,
        country,
        currency,
        roomCategories,
    } = payload;

    await validateCurrency(currency);

    const hotel = await Hotel.create({
        hotelName,
        city,
        country,
        currency,
        roomCategories,
    });

    return populateCurrency(
        Hotel.findById(hotel._id)
    );
};

const getHotels = async () => {
    return populateCurrency(
        Hotel.find().sort({ createdAt: -1 })
    );
};

const getHotelById = async (id) => {
    const hotel = await populateCurrency(
        Hotel.findById(id)
    );

    if (!hotel) {
        throw new Error("Hotel not found");
    }

    return hotel;
};

const updateHotel = async (id, payload) => {
    if (payload.currency) {
        await validateCurrency(payload.currency);
    }

    const hotel = await Hotel.findByIdAndUpdate(
        id,
        payload,
        {
            new: true,
            runValidators: true,
        }
    );

    if (!hotel) {
        throw new Error("Hotel not found");
    }

    return populateCurrency(
        Hotel.findById(hotel._id)
    );
};

const deleteHotel = async (id) => {
    const hotel = await Hotel.findByIdAndDelete(id);

    if (!hotel) {
        throw new Error("Hotel not found");
    }

    return hotel;
};

const toggleHotelStatus = async (id) => {
    const hotel = await Hotel.findById(id);

    if (!hotel) {
        throw new Error("Hotel not found");
    }

    hotel.isActive = !hotel.isActive;

    await hotel.save();

    return populateCurrency(
        Hotel.findById(hotel._id)
    );
};

module.exports = {
    createHotel,
    getHotels,
    getHotelById,
    updateHotel,
    deleteHotel,
    toggleHotelStatus,
};