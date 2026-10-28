const service = require("../services/visaType.service");
const { createCrudController } = require("../utils/crudFactory");

module.exports = createCrudController(service, { entity: "Visa type" });
