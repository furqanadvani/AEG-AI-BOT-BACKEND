/**
 * WhatsApp webhook (Phase 2). Meta Cloud API -> yahan -> workflow -> WhatsApp reply.
 * Integration (type=whatsapp) enable hone tak kuch process nahi hota.
 */
const whatsapp = require("../services/integrations/whatsapp.provider");
const integrationService = require("../services/integration.service");
const workflowService = require("../services/workflow.service");

const verify = async (req, res) => {
  const challenge = await whatsapp.verifyChallenge(req.query);
  if (challenge) return res.status(200).send(String(challenge));
  return res.sendStatus(403);
};

const receive = async (req, res) => {
  const okSig = await whatsapp.verifySignature(req.rawBody, req.headers["x-hub-signature-256"]);
  if (!okSig) return res.sendStatus(401);

  // Meta ko foran 200 (warna woh retry karta hai); processing baad mein
  res.sendStatus(200);

  const wa = await integrationService.getResolved("whatsapp");
  if (!wa.isEnabled) return;

  for (const m of whatsapp.parseInbound(req.body)) {
    if (!m.text) continue;
    try {
      const r = await workflowService.handleMessage({ sessionId: `wa:${m.from}`, text: m.text }, { channel: "whatsapp" });
      if (r.reply) await whatsapp.sendText(m.from, r.replyPlain || r.reply);
    } catch (e) {
      console.error("WhatsApp processing failed:", e.message);
    }
  }
};

module.exports = { verify, receive };
