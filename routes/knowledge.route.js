const controller = require("../controllers/knowledge.controller");
const { buildCrudRouter } = require("../utils/routeFactory");
const { ACL_MODULES } = require("../utils/aclConstants");

// GET / | GET /:id | POST / | PUT /:id | PATCH /:id/status | DELETE /:id | POST /bulk
module.exports = buildCrudRouter({ controller, module: ACL_MODULES.KNOWLEDGE, bulkKey: ["country", "visaType", "topic"] });
