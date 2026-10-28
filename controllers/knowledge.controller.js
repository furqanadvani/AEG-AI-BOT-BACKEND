const service = require("../services/knowledge.service");
const { createCrudController } = require("../utils/crudFactory");

module.exports = createCrudController(service, { entity: "Knowledge" });
