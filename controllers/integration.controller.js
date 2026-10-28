const integrationService = require("../services/integration.service");
const { successResponse } = require("../utils/apiResponse");

module.exports = {
  list: async (req, res) => successResponse(res, "Integrations fetched successfully", await integrationService.list()),
  get: async (req, res) => successResponse(res, "Integration fetched successfully", await integrationService.get(req.params.type)),
  upsert: async (req, res) => successResponse(res, "Integration saved successfully", await integrationService.upsert(req.params.type, req.body || {}, req.user)),
  test: async (req, res) => {
    const r = await integrationService.test(req.params.type);
    return successResponse(res, r.ok ? "Connection successful" : "Connection failed", r);
  },
};
