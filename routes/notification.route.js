const express = require("express");
const controller = require("../controllers/notification.controller");
const { guard } = require("../utils/routeFactory");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

const router = express.Router();

router.get("/", ...guard(ACL_MODULES.NOTIFICATIONS, P.VIEW), controller.list);
router.patch("/:id/read", ...guard(ACL_MODULES.NOTIFICATIONS, P.VIEW), controller.markRead); // :id = "all" bhi

module.exports = router;
