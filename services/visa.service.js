const Visa = require("../models/Visa");
const Currency = require("../models/Currency");

const createVisa = async (payload) => {
    const { visaName, visaType, rate, currency } = payload;

    const currencyExists = await Currency.findOne({
        _id: currency,
        isActive: true,
    });

    if (!currencyExists) {
        throw new Error("Currency not found or inactive");
    }

    const visa = await Visa.create({
        visaName,
        visaType,
        rate,
        currency,
    });

    return await Visa.findById(visa._id).populate(
        "currency",
        "code name symbol decimalPlaces"
    );
};

const getVisas = async () => {
    return await Visa.find()
        .populate(
            "currency",
            "code name symbol decimalPlaces exchangeRates"
        )
        .sort({ createdAt: -1 });
};

const getVisaById = async (id) => {
    const visa = await Visa.findById(id).populate(
        "currency",
        "code name symbol decimalPlaces"
    );

    if (!visa) {
        throw new Error("Visa not found");
    }

    return visa;
};

const updateVisa = async (id, payload) => {
    if (payload.currency) {
        const currencyExists = await Currency.findOne({
            _id: payload.currency,
            isActive: true,
        });

        if (!currencyExists) {
            throw new Error("Currency not found or inactive");
        }
    }

    const visa = await Visa.findByIdAndUpdate(
        id,
        payload,
        {
            new: true,
            runValidators: true,
        }
    ).populate(
        "currency",
        "code name symbol decimalPlaces"
    );

    if (!visa) {
        throw new Error("Visa not found");
    }

    return visa;
};

const deleteVisa = async (id) => {
    const visa = await Visa.findByIdAndDelete(id);

    if (!visa) {
        throw new Error("Visa not found");
    }

    return visa;
};

const toggleVisaStatus = async (id) => {
    const visa = await Visa.findById(id);

    if (!visa) {
        throw new Error("Visa not found");
    }

    visa.isActive = !visa.isActive;

    await visa.save();

    return await Visa.findById(id).populate(
        "currency",
        "code name symbol decimalPlaces"
    );
};

module.exports = {
    createVisa,
    getVisas,
    getVisaById,
    updateVisa,
    deleteVisa,
    toggleVisaStatus,
};