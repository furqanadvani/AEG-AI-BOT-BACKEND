const apiKeyService = require("../services/apiKey.service");
const { successResponse } = require("../utils/apiResponse");

module.exports = {
  list: async (req, res) => {
    const { items, pagination } = await apiKeyService.list(req.query);
    return successResponse(res, "API keys fetched successfully", items, 200, { pagination });
  },
  getById: async (req, res) => successResponse(res, "API key fetched successfully", await apiKeyService.getById(req.params.id)),
  create: async (req, res) => successResponse(res, "API key created successfully", await apiKeyService.create(req.user, req.body || {}), 201),
  update: async (req, res) => successResponse(res, "API key updated successfully", await apiKeyService.update(req.user, req.params.id, req.body || {})),
  setStatus: async (req, res) => successResponse(res, "API key status updated", await apiKeyService.setStatus(req.params.id, (req.body || {}).isActive)),
  regenerate: async (req, res) => successResponse(res, "API key regenerated", await apiKeyService.regenerate(req.user, req.params.id)),
  remove: async (req, res) => successResponse(res, "API key deleted", await apiKeyService.remove(req.params.id)),
  /** GET /api/api-keys/me: key khud check kare uske paas kya scopes hain */
  me: async (req, res) => successResponse(res, "API key info", req.apiKey ? { name: req.apiKey.name, prefix: req.apiKey.prefix, permissions: req.apiKey.permissions } : { user: req.user }),
};
