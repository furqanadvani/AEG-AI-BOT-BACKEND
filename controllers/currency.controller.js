const {
  createCurrency,
  getCurrencies,
  getCurrencyById,
  updateCurrency,
  toggleCurrencyStatus,
} = require("../services/currency.service");

const HTTP_STATUS = require("../constants/httpStatus");
const MESSAGES = require("../constants/messages");

const {
  successResponse,
  errorResponse,
} = require("../utils/apiResponse");

const create = async (req, res) => {
  try {
    const currency = await createCurrency(req.body);

    return successResponse(
      res,
      "Currency created successfully",
      currency,
      HTTP_STATUS.CREATED
    );
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      HTTP_STATUS.BAD_REQUEST
    );
  }
};

const getAll = async (req, res) => {
  try {
    const currencies = await getCurrencies();

    return successResponse(
      res,
      "Currencies fetched successfully",
      currencies,
      HTTP_STATUS.OK
    );
  } catch (error) {
    return errorResponse(
      res,
      MESSAGES.ERROR.INTERNAL_SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

const getById = async (req, res) => {
  try {
    const currency = await getCurrencyById(req.params.id);

    if (!currency) {
      return errorResponse(
        res,
        MESSAGES.ERROR.CURRENCY_NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    return successResponse(
      res,
      "Currency fetched successfully",
      currency,
      HTTP_STATUS.OK
    );
  } catch (error) {
    return errorResponse(
      res,
      MESSAGES.ERROR.INTERNAL_SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

const update = async (req, res) => {
  try {
    const currency = await updateCurrency(
      req.params.id,
      req.body
    );

    if (!currency) {
      return errorResponse(
        res,
        MESSAGES.ERROR.CURRENCY_NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    return successResponse(
      res,
      "Currency updated successfully",
      currency,
      HTTP_STATUS.OK
    );
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      HTTP_STATUS.BAD_REQUEST
    );
  }
};

const toggleStatus = async (req, res) => {
  try {
    const currency = await toggleCurrencyStatus(req.params.id);

    if (!currency) {
      return errorResponse(
        res,
        MESSAGES.ERROR.CURRENCY_NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    return successResponse(
      res,
      "Currency status updated successfully",
      currency,
      HTTP_STATUS.OK
    );
  } catch (error) {
    return errorResponse(
      res,
      MESSAGES.ERROR.INTERNAL_SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

module.exports = {
  create,
  getAll,
  getById,
  update,
  toggleStatus,
};