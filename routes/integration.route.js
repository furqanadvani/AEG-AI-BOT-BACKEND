const express = require("express");
const controller = require("../controllers/integration.controller");
const { guard } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

const router = express.Router();
const M = ACL_MODULES.INTEGRATIONS;

// :type = ai | crm | whatsapp | email
router.get("/", ...guard(M, P.VIEW), controller.list);
router.get("/:type", ...guard(M, P.VIEW), controller.get);
router.put("/:type", ...guard(M, P.UPDATE), controller.upsert);
router.post("/:type/test", ...guard(M, P.UPDATE), controller.test);

module.exports = router;
