const HTTP_STATUS = require("../constants/httpStatus");

const notFoundHandler = (req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: true,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

// Mongoose / JWT / AppError sab ko ek jaisa jawab
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.statusCode || err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = err.message || "Internal server error";
  let details;

  if (err.name === "ValidationError" && err.errors) {
    status = HTTP_STATUS.UNPROCESSABLE_ENTITY;
    message = "Validation failed";
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === "CastError") {
    status = HTTP_STATUS.BAD_REQUEST;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = HTTP_STATUS.CONFLICT;
    message = `Duplicate value: ${Object.keys(err.keyValue || {}).join(", ") || "record"} already exists`;
    details = err.keyValue;
  } else if (err.type === "entity.parse.failed") {
    status = HTTP_STATUS.BAD_REQUEST;
    message = "Invalid JSON body";
  }

  if (status >= 500) console.error("Global Error:", err);

  const body = { error: true, message };
  if (err.code && typeof err.code === "string") body.code = err.code;
  if (details || err.details) body.details = details || err.details;
  if (status >= 500 && process.env.NODE_ENV === "production") body.message = "Internal server error";

  res.status(status).json(body);
};

module.exports = { notFoundHandler, errorHandler };
