/** AI retry / fallback: provider aur settings ko stub karke (DB / Groq ke baghair) */
// V19: usage cache / batching band (har test apna mocked usage dekhe)
process.env.AI_USAGE_CACHE_MS = "0";
process.env.AI_USAGE_SYNC = "true";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const stub = (rel, exports) => { const p = require.resolve(path.join(__dirname, "..", rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports }; };
const settings = { FallbackModel: "small-model", AiMaxRetries: "1" };
stub("services/setting.service", {
  getBool: async () => true, getNumber: async (k, d) => (settings[k] !== undefined ? Number(settings[k]) : d), getList: async () => [], getRaw: async (k) => settings[k] || "",
});
stub("services/notification.service", { notify: async () => {} });
stub("models/AiUsage", { findOne: () => ({ lean: async () => null }), updateOne: async () => {} });
let script = [];
const calls = [];
stub("services/integrations/ai.provider", { chatCompletion: async (p) => { calls.push(p.model); const s = script.shift(); if (s instanceof Error) throw s; return s; } });
const ai = require("../services/ai.service");

const good = { choices: [{ message: { content: '{"reply":"hi"}' }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
const err = (status) => Object.assign(new Error(`HTTP ${status}`), { status, retryAfter: 0.01 });
const payload = { model: "big-model", messages: [{ role: "system", content: "x" }, { role: "user", content: "{}" }] };

test("429 ke baad retry kamyab", async () => {
  script = [err(429), good]; calls.length = 0;
  const r = await ai.run({ purpose: "reply", payload });
  assert.equal(r.ok, true); assert.deepEqual(calls, ["big-model", "big-model"]);
});

test("primary do dafa fail -> fallback model", async () => {
  script = [err(503), err(503), good]; calls.length = 0;
  const r = await ai.run({ purpose: "reply", payload });
  assert.equal(r.ok, true); assert.deepEqual(calls, ["big-model", "big-model", "small-model"]);
});

test("adhoora JSON (finish_reason=length) retry hota hai", async () => {
  script = [{ choices: [{ message: { content: '{"reply":"hel' }, finish_reason: "length" }], usage: {} }, good]; calls.length = 0;
  const r = await ai.run({ purpose: "reply", payload });
  assert.equal(r.ok, true); assert.equal(calls.length, 2);
});

test("auth error par wohi model dobara nahi, seedha fallback", async () => {
  script = [err(401), good]; calls.length = 0;
  const r = await ai.run({ purpose: "reply", payload });
  assert.equal(r.ok, true); assert.deepEqual(calls, ["big-model", "small-model"]);
});

test("sab fail -> ok:false + wajah, throw nahi", async () => {
  script = [err(429), err(429), err(429)]; calls.length = 0;
  const r = await ai.run({ purpose: "reply", payload });
  assert.equal(r.ok, false); assert.equal(r.limited, false); assert.equal(r.error, "rate_limit");
});
