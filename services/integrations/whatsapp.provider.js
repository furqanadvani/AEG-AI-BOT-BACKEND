const crypto = require("crypto");
const { request } = require("./http");
const integrationService = require("../integration.service");
const { safeEqual } = require("../../utils/crypto");

const getConn = async () => {
  const wa = await integrationService.getResolved("whatsapp");
  return { ...wa, base: `https://graph.facebook.com/${wa.config.apiVersion || "v21.0"}/${wa.config.phoneNumberId}` };
};

const sendText = async (to, text) => {
  const wa = await getConn();
  if (!wa.isEnabled) return { skipped: true, reason: "whatsapp_disabled" };
  if (!wa.config.phoneNumberId || !wa.secrets.accessToken) throw new Error("WhatsApp phoneNumberId / accessToken missing");
  const body = String(text || "").replace(/ {2}\n/g, "\n").slice(0, 4096);
  return request(`${wa.base}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${wa.secrets.accessToken}` },
    body: { messaging_product: "whatsapp", recipient_type: "individual", to: String(to).replace(/^\+/, ""), type: "text", text: { preview_url: false, body } },
  });
};

/** Meta webhook verification (GET) */
const verifyChallenge = async (query) => {
  const wa = await getConn();
  if (query["hub.mode"] === "subscribe" && wa.secrets.verifyToken && safeEqual(query["hub.verify_token"], wa.secrets.verifyToken)) {
    return query["hub.challenge"];
  }
  return null;
};

/** X-Hub-Signature-256 check (appSecret set ho to lazmi) */
const verifySignature = async (rawBody, signature) => {
  const wa = await getConn();
  if (!wa.secrets.appSecret) return true;
  if (!signature || !rawBody) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", wa.secrets.appSecret).update(rawBody).digest("hex");
  return safeEqual(signature, expected);
};

/** Webhook body se text messages nikalna */
const parseInbound = (body) => {
  const out = [];
  for (const entry of body?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || ""]));
      for (const m of v.messages || []) {
        let text = "";
        if (m.type === "text") text = m.text?.body || "";
        else if (m.type === "button") text = m.button?.text || "";
        else if (m.type === "interactive") text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
        out.push({ from: m.from, name: names[m.from] || "", id: m.id, type: m.type, text, timestamp: m.timestamp });
      }
    }
  }
  return out;
};

const ping = async () => {
  const wa = await getConn();
  if (!wa.config.phoneNumberId || !wa.secrets.accessToken) throw new Error("WhatsApp phoneNumberId / accessToken missing");
  return request(wa.base, { headers: { Authorization: `Bearer ${wa.secrets.accessToken}` }, timeoutMs: 10000 });
};

module.exports = { sendText, verifyChallenge, verifySignature, parseInbound, ping };
