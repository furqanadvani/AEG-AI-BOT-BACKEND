const service = require("../services/question.service");
const { createCrudController } = require("../utils/crudFactory");

module.exports = createCrudController(service, { entity: "Question" });
