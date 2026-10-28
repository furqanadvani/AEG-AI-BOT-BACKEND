const workflowService = require("../services/workflow.service");
const { successResponse } = require("../utils/apiResponse");
const AppError = require("../utils/AppError");
const { CHANNELS } = require("../constants/workflow");

/**
 * POST /api/chat/message
 * Body: { sessionId, text }   (n8n chat format { sessionId, chatInput } bhi chalta hai)
 * Response: { error, message, data: { reply, sessionId, next, leadId, aiLimited }, output }
 */
const sendMessage = async (req, res) => {
  const body = req.body || {};
  if (!String(body.text ?? body.chatInput ?? body.message ?? "").trim()) throw AppError.badRequest("text is required");
  // API key (website / n8n / bridge) apna channel bata sakti hai; member ka message "test" channel
  const channel = req.apiKey ? (CHANNELS.includes(body.channel) ? body.channel : "api") : "test";
  const result = await workflowService.handleMessage(body, { channel, debug: String(req.query.debug) === "true" });
  // `output` field: n8n chat widget compatible
  return res.status(200).json({ error: false, message: "Message processed", data: result, output: result.reply });
};

module.exports = { sendMessage };
