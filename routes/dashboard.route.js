const express = require("express");
const controller = require("../controllers/dashboard.controller");
const { guard } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

const router = express.Router();

router.get("/stats", ...guard(ACL_MODULES.DASHBOARD, P.VIEW), controller.stats);

module.exports = router;
