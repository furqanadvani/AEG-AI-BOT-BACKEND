const HTTP_STATUS = require("../constants/httpStatus");

/** Ek hi error class poore backend mein: service throw kare, global handler jawab de */
class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(msg, details) { return new AppError(msg, HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST", details); }
  static unauthorized(msg = "Unauthorized") { return new AppError(msg, HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED"); }
  static forbidden(msg = "Access forbidden") { return new AppError(msg, HTTP_STATUS.FORBIDDEN, "FORBIDDEN"); }
  static notFound(msg = "Record not found") { return new AppError(msg, HTTP_STATUS.NOT_FOUND, "NOT_FOUND"); }
  static conflict(msg = "Record already exists") { return new AppError(msg, HTTP_STATUS.CONFLICT, "CONFLICT"); }
}

module.exports = AppError;
