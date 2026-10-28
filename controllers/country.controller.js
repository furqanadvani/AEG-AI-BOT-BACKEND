const service = require("../services/country.service");
const { createCrudController } = require("../utils/crudFactory");

module.exports = createCrudController(service, { entity: "Country" });
