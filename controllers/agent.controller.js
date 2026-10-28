const service = require("../services/agent.service");
const { createCrudController } = require("../utils/crudFactory");

module.exports = createCrudController(service, { entity: "Agent" });
