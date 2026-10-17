const sessionService = require("../services/session.service");
const { createCrudController } = require("../utils/crudFactory");
const { successResponse } = require("../utils/apiResponse");

const base = createCrudController(sessionService, { entity: "Session" });

module.exports = {
  ...base,
  reset: async (req, res) => successResponse(res, "Session reset successfully", await sessionService.reset(req.params.id)),
  transcript: async (req, res) => successResponse(res, "Transcript fetched successfully", await sessionService.getTranscript(req.params.id)),
  takeover: async (req, res) => successResponse(res, "Session takeover updated", await sessionService.setTakeover(req.params.id, (req.body || {}).humanTakeover)),
};
