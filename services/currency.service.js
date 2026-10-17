const Currency = require("../models/Currency");

const createCurrency = async (payload) => {
  const {
    code,
    name,
    symbol,
    decimalPlaces,
    exchangeRates,
  } = payload;

  const existingCurrency = await Currency.findOne({
    code: code.toUpperCase(),
  });

  if (existingCurrency) {
    throw new Error("Currency already exists");
  }

  const currency = await Currency.create({
    code,
    name,
    symbol,
    decimalPlaces,
    exchangeRates,
  });

  return currency;
};

const getCurrencies = async () => {
  return await Currency.find().sort({
    createdAt: -1,
  });
};

const getCurrencyById = async (id) => {
  return await Currency.findById(id);
};

const updateCurrency = async (id, payload) => {
  const currency = await Currency.findByIdAndUpdate(
    id,
    payload,
    {
      new: true,
      runValidators: true,
    }
  );

  return currency;
};

const toggleCurrencyStatus = async (id) => {
  const currency = await Currency.findById(id);

  if (!currency) {
    return null;
  }

  currency.isActive = !currency.isActive;

  await currency.save();

  return currency;
};

module.exports = {
  createCurrency,
  getCurrencies,
  getCurrencyById,
  updateCurrency,
  toggleCurrencyStatus,
};