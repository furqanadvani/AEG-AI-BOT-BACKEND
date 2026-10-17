const express = require("express");

const currencyRoutes = require("./currency.route");
const authRoute = require("./auth.route");
const roleRoutes = require("./role.routes");
const memberRoutes = require("./member.route");
const visasRoutes = require("./visa.route");
const hotelRoutes = require("./hotel.route");
const customerRoutes = require("./customer.route");

// Visa AI workflow (pehle Excel tabs)
const settingRoutes = require("./setting.route");
const countryRoutes = require("./country.route");
const visaTypeRoutes = require("./visaType.route");
const questionRoutes = require("./question.route");
const knowledgeRoutes = require("./knowledge.route");
const agentRoutes = require("./agent.route");
const leadRoutes = require("./lead.route");
const queryRoutes = require("./query.route");
const sessionRoutes = require("./session.route");
const chatLogRoutes = require("./chatLog.route");

// Control
const chatRoutes = require("./chat.route");
const aiRoutes = require("./ai.route");
const integrationRoutes = require("./integration.route");
const apiKeyRoutes = require("./apiKey.route");
const notificationRoutes = require("./notification.route");
const dashboardRoutes = require("./dashboard.route");
const webhookRoutes = require("./webhook.route");

const router = express.Router();

router.use("/currencies", currencyRoutes);
router.use("/auth", authRoute);
router.use("/roles", roleRoutes);
router.use("/members", memberRoutes);
router.use("/visas", visasRoutes);
router.use("/hotels", hotelRoutes);
router.use("/customers", customerRoutes);

router.use("/settings", settingRoutes);
router.use("/countries", countryRoutes);
router.use("/visa-types", visaTypeRoutes);
router.use("/questions", questionRoutes);
router.use("/knowledge", knowledgeRoutes);
router.use("/agents", agentRoutes);
router.use("/leads", leadRoutes);
router.use("/queries", queryRoutes);
router.use("/sessions", sessionRoutes);
router.use("/chat-logs", chatLogRoutes);

router.use("/chat", chatRoutes);
router.use("/ai", aiRoutes);
router.use("/integrations", integrationRoutes);
router.use("/api-keys", apiKeyRoutes);
router.use("/notifications", notificationRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/webhooks", webhookRoutes);

module.exports = router;
