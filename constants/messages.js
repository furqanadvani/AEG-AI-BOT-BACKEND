const MESSAGES = {
  SUCCESS: {
    CREATED: "Created successfully",
    UPDATED: "Updated successfully",
    DELETED: "Deleted successfully",
    FETCHED: "Fetched successfully",
    STATUS_UPDATED: "Status updated successfully",
  },

  ERROR: {
    INTERNAL_SERVER_ERROR: "Something went wrong",
    VALIDATION_ERROR: "Validation failed",
    UNAUTHORIZED: "Unauthorized access",
    FORBIDDEN: "Access forbidden",
    NOT_FOUND: "Record not found",
    ALREADY_EXISTS: "Record already exists",
    INVALID_ID: "Invalid id",

    CURRENCY_NOT_FOUND: "Currency not found",
    CURRENCY_ALREADY_EXISTS: "Currency already exists",
    INVALID_CURRENCY_CODE: "Invalid currency code",

    EXCHANGE_RATE_NOT_FOUND: "Exchange rate not found",
    EXCHANGE_RATE_ALREADY_EXISTS: "Exchange rate already exists",
    INVALID_EXCHANGE_RATE: "Invalid exchange rate",

    TARGET_CURRENCY_NOT_FOUND: "Target currency does not exist",

    INVALID_API_KEY: "Invalid or inactive API key",
    AI_LIMIT_REACHED: "AI usage limit reached",
  },
};

// Dono tarah import ho sake: require(...) aur { MESSAGES } = require(...)
module.exports = MESSAGES;
module.exports.MESSAGES = MESSAGES;
