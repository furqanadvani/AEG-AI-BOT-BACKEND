const controller = require("../controllers/question.controller");
const { buildCrudRouter } = require("../utils/routeFactory");
const { ACL_MODULES } = require("../utils/aclConstants");

// GET / | GET /:id | POST / | PUT /:id | PATCH /:id/status | DELETE /:id | POST /bulk
module.exports = buildCrudRouter({ controller, module: ACL_MODULES.QUESTIONS, bulkKey: ["country", "visaType", "field"] });
