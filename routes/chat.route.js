const express = require("express");
const controller = require("../controllers/chat.controller");
const { guard } = require("../utils/routeFactory");
const { chatLimiter } = require("../middlewares/rateLimit");
const { ACL_MODULES, ACL_PERMISSIONS: P } = require("../utils/aclConstants");

const router = express.Router();

// Member (JWT) ya API key jiske paas CHAT:CREATE ho
router.post("/message", chatLimiter, ...guard(ACL_MODULES.CHAT, P.CREATE), controller.sendMessage);

module.exports = router;
