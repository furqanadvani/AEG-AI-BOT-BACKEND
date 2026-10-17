const successResponse = (res, message, data = null, statusCode = 200, meta = undefined) => {
  const body = { error: false, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

const errorResponse = (res, message, statusCode = 500, code = undefined, details = undefined) => {
  const body = { error: true, message };
  if (code) body.code = code;
  if (details) body.details = details;
  return res.status(statusCode).json(body);
};

module.exports = {
  successResponse,
  errorResponse,
};
