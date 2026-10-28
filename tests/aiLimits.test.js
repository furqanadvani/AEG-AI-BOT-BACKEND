/** AI control: limits, switches, auto-normal mode + notification (DB/provider mocked) */
// V19: usage cache / batching band (har test apna mocked usage dekhe)
process.env.AI_USAGE_CACHE_MS = "0";
process.env.AI_USAGE_SYNC = "true";
const test = require("node:test");
const assert = require("node:assert");
const settingService = require("../services/setting.service");
const AiUsage = require("../models/AiUsage");
const notificationService = require("../services/notification.service");
const aiProvider = require("../services/integrations/ai.provider");
const ai = require("../services/ai.service");

let settings = {};
let usage = { day: {}, month: {} };
const notified = [];
let providerCalls = 0;

settingService.getBool = async (k, d) => (settings[k] === undefined ? d : /^(yes|true|1)$/i.test(settings[k]));
settingService.getNumber = async (k, d) => (settings[k] === undefined ? d : Number(settings[k]));
settingService.getList = async (k) => (settings[k] ? settings[k].split(",") : []);
settingService.getRaw = async (k) => settings[k];
AiUsage.findOne = (f) => ({ lean: async () => (f.period === "day" ? usage.day : usage.month) });
AiUsage.updateOne = async () => ({});
notificationService.notify = async (n) => { notified.push(n); return n; };
aiProvider.chatCompletion = async () => { providerCalls++; return { choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }; };

const payload = { model: "m", messages: [{ role: "system", content: "sys" }, { role: "user", content: "{}" }] };
const reset = () => { settings = {}; usage = { day: { totalTokens: 0, requests: 0 }, month: { totalTokens: 0, requests: 0 } }; notified.length = 0; providerCalls = 0; };

test("allowed when under limits", async () => {
  reset();
  settings = { AiDailyTokenLimit: "1000" };
  usage.day.totalTokens = 100;
  const r = await ai.run({ purpose: "understand", payload });
  assert.equal(r.ok, true);
  assert.equal(providerCalls, 1);
});

test("daily token limit reached -> limited, no provider call, notification with dedupeKey", async () => {
  reset();
  settings = { AiDailyTokenLimit: "1000", AiLimitNotifyEmails: "boss@aeg.test" };
  usage.day.totalTokens = 1000;
  const r = await ai.run({ purpose: "understand", payload });
  assert.equal(r.ok, false);
  assert.equal(r.limited, true);
  assert.equal(r.reason, "daily_token_limit");
  assert.equal(providerCalls, 0);
  await new Promise((s) => setTimeout(s, 10));
  assert.equal(notified[0].type, "AI_LIMIT_REACHED");
  assert.match(notified[0].dedupeKey, /^ai_limit:daily_token_limit:\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(notified[0].emailTo, ["boss@aeg.test"]);
});

test("monthly + request limits and per-session cap", async () => {
  reset(); settings = { AiMonthlyTokenLimit: "500" }; usage.month.totalTokens = 600;
  assert.equal((await ai.run({ purpose: "reply", payload })).reason, "monthly_token_limit");
  reset(); settings = { AiDailyRequestLimit: "3" }; usage.day.requests = 3;
  assert.equal((await ai.run({ purpose: "reply", payload })).reason, "daily_request_limit");
  reset(); settings = { AiMaxCallsPerSession: "5" };
  assert.equal((await ai.run({ purpose: "reply", payload, sessionAiCalls: 5 })).reason, "session_limit");
});

test("switches: master off / understand off", async () => {
  reset(); settings = { AiEnabled: "no" };
  assert.equal((await ai.run({ purpose: "understand", payload })).reason, "ai_disabled");
  reset(); settings = { AiUnderstandEnabled: "no" };
  assert.equal((await ai.run({ purpose: "understand", payload })).reason, "understand_disabled");
  assert.equal((await ai.run({ purpose: "reply", payload })).ok, true);
});

test("admin prompt append + max tokens applied from settings", async () => {
  reset();
  settings = { AiUnderstandMaxTokens: "321", UnderstandPromptAppend: "Never discuss pricing." };
  let sent;
  aiProvider.chatCompletion = async (p) => { sent = p; return { choices: [], usage: {} }; };
  await ai.run({ purpose: "understand", payload });
  assert.equal(sent.max_completion_tokens, 321);
  assert.match(sent.messages[0].content, /Never discuss pricing\./);
  assert.equal(payload.messages[0].content, "sys"); // original payload not mutated
});

test("provider error never throws (engine falls back)", async () => {
  reset();
  aiProvider.chatCompletion = async () => { throw new Error("boom"); };
  const r = await ai.run({ purpose: "reply", payload });
  assert.equal(r.ok, false);
  assert.equal(r.limited, false);
});
