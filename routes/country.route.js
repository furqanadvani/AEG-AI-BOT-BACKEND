const controller = require("../controllers/country.controller");
const { buildCrudRouter } = require("../utils/routeFactory");
const { ACL_MODULES } = require("../utils/aclConstants");

// GET / | GET /:id | POST / | PUT /:id | PATCH /:id/status | DELETE /:id | POST /bulk
module.exports = buildCrudRouter({ controller, module: ACL_MODULES.COUNTRIES, bulkKey: ["name"] });
