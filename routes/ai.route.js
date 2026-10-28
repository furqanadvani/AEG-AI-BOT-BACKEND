const express = require("express");
const controller = require("../controllers/ai.controller");
const { guard } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

const router = express.Router();
const M = ACL_MODULES.AI_CONTROL;

router.get("/status", ...guard(M, P.VIEW), controller.status);
router.get("/usage", ...guard(M, P.VIEW), controller.usage);
router.get("/settings", ...guard(M, P.VIEW), controller.getSettings);
router.put("/settings", ...guard(M, P.UPDATE), controller.updateSettings);
router.post("/test", ...guard(M, P.UPDATE), controller.test);

module.exports = router;
