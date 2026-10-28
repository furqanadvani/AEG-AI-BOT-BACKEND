const { request } = require("./http");
const integrationService = require("../integration.service");

const getConn = async () => {
  const ai = await integrationService.getResolved("ai");
  if (!ai.secrets.apiKey) throw new Error("AI API key is not configured (Integrations > AI ya .env AI_API_KEY)");
  return { baseUrl: String(ai.config.baseUrl || "").replace(/\/+$/, ""), apiKey: ai.secrets.apiKey, enabled: ai.isEnabled, provider: ai.provider };
};

// V19: ek server se ek waqt mein zyada se zyada N AI requests (baqi line mein). 1000 customers ka burst
// provider par 429 ka toofan nahi banta; line zyada lambi ho to foran rule-based jawab (customer intezar na kare).
const gate = { active: 0, queue: [] };
const acquire = (max, waitMs) => new Promise((resolve, reject) => {
  if (gate.active < max) { gate.active++; return resolve(); }
  const item = { resolve: () => { clearTimeout(item.timer); gate.active++; resolve(); } };
  item.timer = setTimeout(() => {
    const i = gate.queue.indexOf(item); if (i >= 0) gate.queue.splice(i, 1);
    reject(Object.assign(new Error(`AI queue full: waited ${waitMs}ms`), { code: "queue_timeout" }));
  }, waitMs);
  gate.queue.push(item);
});
const release = () => { gate.active = Math.max(0, gate.active - 1); const next = gate.queue.shift(); if (next) next.resolve(); };
const stats = () => ({ active: gate.active, queued: gate.queue.length });

const chatCompletion = async (payload, { timeoutMs = 20000, maxConcurrent = 40, queueTimeoutMs = 8000 } = {}) => {
  const { baseUrl, apiKey } = await getConn();
  await acquire(Math.max(1, maxConcurrent), Math.max(500, queueTimeoutMs));
  try {
    return await request(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: payload,
      timeoutMs,
    });
  } finally {
    release();
  }
};

const ping = async () => {
  const { baseUrl, apiKey, provider } = await getConn();
  const r = await request(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: 10000 });
  return { provider, models: (r?.data || []).slice(0, 20).map((m) => m.id) };
};

module.exports = { chatCompletion, ping, stats };
