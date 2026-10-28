const express = require("express");
const controller = require("../controllers/webhook.controller");

const router = express.Router();

// Public (Meta yahan call karta hai). Security: verify token + X-Hub-Signature-256
router.get("/whatsapp", controller.verify);
router.post("/whatsapp", controller.receive);

module.exports = router;
