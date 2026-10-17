const { request } = require("./http");
const integrationService = require("../integration.service");

const getConn = async () => {
  const ai = await integrationService.getResolved("ai");
  if (!ai.secrets.apiKey) throw new Error("AI API key is not configured (Integrations > AI ya .env AI_API_KEY)");
  return { baseUrl: String(ai.config.baseUrl || "").replace(/\/+$/, ""), apiKey: ai.secrets.apiKey, enabled: ai.isEnabled, provider: ai.provider };
};

const chatCompletion = async (payload, { timeoutMs = 20000 } = {}) => {
  const { baseUrl, apiKey } = await getConn();
  return request(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: payload,
    timeoutMs,
  });
};

const ping = async () => {
  const { baseUrl, apiKey, provider } = await getConn();
  const r = await request(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: 10000 });
  return { provider, models: (r?.data || []).slice(0, 20).map((m) => m.id) };
};

module.exports = { chatCompletion, ping };
