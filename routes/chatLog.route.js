const controller = require("../controllers/chatLog.controller");
const { buildCrudRouter } = require("../utils/routeFactory");
const { ACL_MODULES } = require("../utils/aclConstants");

module.exports = buildCrudRouter({ controller, module: ACL_MODULES.CHAT_LOGS, only: ["list", "getById"] });
