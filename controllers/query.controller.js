const queryService = require("../services/query.service");
const { createCrudController } = require("../utils/crudFactory");
const { successResponse } = require("../utils/apiResponse");

const base = createCrudController(queryService, { entity: "Query" });

module.exports = {
  ...base,
  answer: async (req, res) => successResponse(res, "Query updated successfully", await queryService.answer(req.params.id, req.body || {}, req.user)),
};
