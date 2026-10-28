/**
 * AI Control: bot ki har AI call isi se guzarti hai.
 *  - Master switch + per-step switch (Understand / Reply)
 *  - Limits: daily tokens, monthly tokens, daily requests, per-session calls
 *  - Limit par AI call nahi hoti -> engine apne rule-based (normal) raste par chalta hai
 *  - Warning (AiWarnAtPercent) aur limit reach par notification + email (din/mahine mein ek dafa)
 *  - Usage tracking (AiUsage collection) dashboard ke liye
 */
const AiUsage = require("../models/AiUsage");
const settingService = require("./setting.service");
const notificationService = require("./notification.service");
const aiProvider = require("./integrations/ai.provider");
const { ACL_MODULES } = require("../utils/aclConstants");

const PURPOSE_SWITCH = { understand: "AiUnderstandEnabled", reply: "AiReplyEnabled" };
const PURPOSE_MAXTOK = { understand: "AiUnderstandMaxTokens", reply: "AiReplyMaxTokens" };

const pkDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }); // YYYY-MM-DD
const keys = () => { const d = pkDate(); return { day: d, month: d.slice(0, 7) }; };

const getLimits = async () => ({
  enabled: await settingService.getBool("AiEnabled", true),
  understandEnabled: await settingService.getBool("AiUnderstandEnabled", true),
  replyEnabled: await settingService.getBool("AiReplyEnabled", true),
  dailyTokens: await settingService.getNumber("AiDailyTokenLimit", 0),
  monthlyTokens: await settingService.getNumber("AiMonthlyTokenLimit", 0),
  dailyRequests: await settingService.getNumber("AiDailyRequestLimit", 0),
  perSession: await settingService.getNumber("AiMaxCallsPerSession", 0),
  warnAt: await settingService.getNumber("AiWarnAtPercent", 80),
  notifyEmails: await settingService.getList("AiLimitNotifyEmails"),
  timeoutMs: await settingService.getNumber("AiTimeoutMs", 20000),
});

const getUsageFromDb = async () => {
  const k = keys();
  const [day, month] = await Promise.all([
    AiUsage.findOne({ period: "day", key: k.day }).lean(),
    AiUsage.findOne({ period: "month", key: k.month }).lean(),
  ]);
  const z = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, failures: 0, blocked: 0, byPurpose: {} };
  return { day: { ...z, ...(day || {}), key: k.day }, month: { ...z, ...(month || {}), key: k.month } };
};

// V19: usage har AI call par DB se nahi: 5 sec cache + abhi tak flush na hue increments. Dashboard (status) hamesha taaza.
const USAGE_CACHE_MS = Number(process.env.AI_USAGE_CACHE_MS ?? 5000);
let usageCache = null, usageAt = 0;
const pending = { requests: 0, totalTokens: 0 };
const getUsage = async ({ fresh = false } = {}) => {
  if (fresh || !usageCache || Date.now() - usageAt > USAGE_CACHE_MS || usageCache.day.key !== keys().day) {
    usageCache = await getUsageFromDb(); usageAt = Date.now();
  }
  const add = (x) => ({ ...x, requests: x.requests + pending.requests, totalTokens: x.totalTokens + pending.totalTokens });
  return { day: add(usageCache.day), month: add(usageCache.month) };
};

const pct = (used, limit) => (limit > 0 ? Math.round((used / limit) * 100) : 0);

/** Kya abhi AI call ho sakti hai? { allowed, reason } */
const checkAllowance = async ({ purpose, sessionAiCalls = 0 } = {}) => {
  const L = await getLimits();
  if (!L.enabled) return { allowed: false, reason: "ai_disabled" };
  if (purpose === "understand" && !L.understandEnabled) return { allowed: false, reason: "understand_disabled" };
  if (purpose === "reply" && !L.replyEnabled) return { allowed: false, reason: "reply_disabled" };
  if (L.perSession > 0 && sessionAiCalls >= L.perSession) return { allowed: false, reason: "session_limit" };
  // Koi limit set hi nahi (0 = unlimited): usage parhne ki zaroorat nahi
  if (!(L.dailyTokens > 0 || L.monthlyTokens > 0 || L.dailyRequests > 0)) return { allowed: true, L };

  const U = await getUsage();
  if (L.dailyTokens > 0 && U.day.totalTokens >= L.dailyTokens) return { allowed: false, reason: "daily_token_limit", L, U };
  if (L.monthlyTokens > 0 && U.month.totalTokens >= L.monthlyTokens) return { allowed: false, reason: "monthly_token_limit", L, U };
  if (L.dailyRequests > 0 && U.day.requests >= L.dailyRequests) return { allowed: false, reason: "daily_request_limit", L, U };
  return { allowed: true, L, U };
};

const LIMIT_TITLES = {
  daily_token_limit: "AI daily token limit reached",
  monthly_token_limit: "AI monthly token limit reached",
  daily_request_limit: "AI daily request limit reached",
};

const notifyLimit = async (reason, L, U) => {
  if (!LIMIT_TITLES[reason]) return;
  const k = keys();
  const periodKey = reason.startsWith("monthly") ? k.month : k.day;
  await notificationService.notify({
    type: "AI_LIMIT_REACHED",
    level: "error",
    title: LIMIT_TITLES[reason],
    message: "AI calls are paused. The bot keeps running in normal (rule-based) mode. You can raise the limit from AI Control.",
    meta: { reason, usage: { day: U?.day?.totalTokens, month: U?.month?.totalTokens, requestsToday: U?.day?.requests }, limits: { daily: L?.dailyTokens, monthly: L?.monthlyTokens, dailyRequests: L?.dailyRequests } },
    dedupeKey: `ai_limit:${reason}:${periodKey}`,
    module: ACL_MODULES.AI_CONTROL,
    emailTo: L?.notifyEmails || [],
  });
};

const maybeWarn = async (L, U) => {
  if (!L || !(L.warnAt > 0 && L.warnAt < 100)) return;
  const k = keys();
  const checks = [
    ["daily_tokens", U.day.totalTokens, L.dailyTokens, k.day],
    ["monthly_tokens", U.month.totalTokens, L.monthlyTokens, k.month],
    ["daily_requests", U.day.requests, L.dailyRequests, k.day],
  ];
  for (const [name, used, limit, pk] of checks) {
    if (limit > 0 && pct(used, limit) >= L.warnAt && used < limit) {
      await notificationService.notify({
        type: "AI_LIMIT_WARNING",
        level: "warning",
        title: `AI usage ${pct(used, limit)}% of ${name.replace("_", " ")} limit`,
        message: `Used ${used} of ${limit}.`,
        meta: { name, used, limit },
        dedupeKey: `ai_warn:${name}:${pk}`,
        module: ACL_MODULES.AI_CONTROL,
        emailTo: L.notifyEmails,
      });
    }
  }
};

// V19: usage counters memory mein jama, har 2 sec ek saath DB mein ($inc). Pehle har AI call par 2 writes
// ek hi document par hote the (1000 customers par yeh sabse bara bottleneck tha).
let buffer = {}; let flushTimer = null;
const flushUsage = async () => {
  flushTimer = null;
  const b = buffer; buffer = {};
  const jobs = [];
  for (const [bk, inc] of Object.entries(b)) {
    const [period, key] = bk.split("|");
    jobs.push(AiUsage.updateOne({ period, key }, { $inc: inc }, { upsert: true }));
  }
  pending.requests = 0; pending.totalTokens = 0; usageAt = 0; // agli check DB se taaza
  const res = await Promise.allSettled(jobs);
  for (const r of res) if (r.status === "rejected") console.error("AI usage flush failed:", r.reason?.message);
};
const record = async ({ purpose, usage = {}, failed = false, blocked = false }) => {
  const k = keys();
  const p = usage.prompt_tokens || 0, c = usage.completion_tokens || 0;
  const t = usage.total_tokens || p + c;
  const inc = {
    requests: blocked ? 0 : 1, promptTokens: p, completionTokens: c, totalTokens: t,
    failures: failed ? 1 : 0, blocked: blocked ? 1 : 0,
    [`byPurpose.${purpose}.requests`]: blocked ? 0 : 1, [`byPurpose.${purpose}.tokens`]: t,
  };
  for (const bk of [`day|${k.day}`, `month|${k.month}`]) {
    const cur = buffer[bk] || (buffer[bk] = {});
    for (const [f, v] of Object.entries(inc)) cur[f] = (cur[f] || 0) + v;
  }
  pending.requests += inc.requests; pending.totalTokens += t;
  if (process.env.NODE_ENV === "test" || process.env.AI_USAGE_SYNC === "true") return flushUsage();
  if (!flushTimer) { flushTimer = setTimeout(flushUsage, 2000); flushTimer.unref?.(); }
};

/** Error ki wajah ek lafz mein (ChatLog.aiError + report ke liye) */
const classify = (e) => {
  if (e.code === "queue_timeout") return "queue_timeout";
  if (e.code === "timeout") return "timeout";
  if (e.code === "truncated" || e.code === "bad_json" || e.code === "empty") return e.code;
  if (e.status === 429) return "rate_limit";
  if (e.status >= 500) return "server_error";
  if (e.status === 401 || e.status === 403) return "auth_error";
  if (e.status === 400) return "bad_request";
  if (/fetch failed|ECONN|ENOTFOUND|socket/i.test(e.message || "")) return "network";
  return "unknown";
};
const RETRYABLE = new Set(["timeout", "rate_limit", "server_error", "network", "truncated", "bad_json", "empty"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Jawab sahi hai? Khali / adhoora (finish_reason=length) / tuta JSON = fail, taake retry ho */
const checkJson = (json) => {
  const ch = json?.choices?.[0];
  const content = ch?.message?.content;
  const err = (code, msg) => Object.assign(new Error(msg), { code });
  if (!content || !String(content).trim()) throw err(ch?.finish_reason === "length" ? "truncated" : "empty", `AI returned no content (finish_reason=${ch?.finish_reason})`);
  try { JSON.parse(String(content).replace(/```json|```/g, "").trim()); }
  catch { throw err(ch?.finish_reason === "length" ? "truncated" : "bad_json", `AI returned invalid JSON (finish_reason=${ch?.finish_reason})`); }
};

const addUsage = (a, b = {}) => ({
  prompt_tokens: (a.prompt_tokens || 0) + (b.prompt_tokens || 0),
  completion_tokens: (a.completion_tokens || 0) + (b.completion_tokens || 0),
  total_tokens: (a.total_tokens || 0) + (b.total_tokens || (b.prompt_tokens || 0) + (b.completion_tokens || 0)),
});

/**
 * Engine ki AI call. Kabhi throw nahi karta.
 * Retry: 429 / timeout / 5xx / khali ya tuta JSON par -> wohi model ek dafa aur, phir FallbackModel (agar set ho).
 * Return: { ok, json, usage, limited, reason, error, attempts }
 *   json = provider ka raw response ({ choices, usage }) bilkul n8n HTTP node jaisa
 */
const run = async ({ purpose, payload, sessionAiCalls = 0 }) => {
  let allow;
  try {
    allow = await checkAllowance({ purpose, sessionAiCalls });
    if (!allow.allowed) {
      await record({ purpose, blocked: true }).catch(() => {});
      if (allow.L) notifyLimit(allow.reason, allow.L, allow.U).catch(() => {});
      return { ok: false, limited: true, reason: allow.reason };
    }
  } catch (e) {
    console.error(`[ai:${purpose}] allowance check failed:`, e.message);
    return { ok: false, limited: false, reason: "provider_error", error: "unknown" };
  }

  // Backend se control: max tokens + extra prompt hidayat
  const base = JSON.parse(JSON.stringify(payload));
  const maxTok = await settingService.getNumber(PURPOSE_MAXTOK[purpose], 0).catch(() => 0);
  if (maxTok > 0) base.max_completion_tokens = maxTok;
  const extra = await settingService.getRaw(purpose === "understand" ? "UnderstandPromptAppend" : "ReplyPromptAppend").catch(() => "");
  if (extra && base.messages?.[0]?.role === "system") base.messages[0].content += `\n\nADDITIONAL INSTRUCTIONS FROM ADMIN:\n${extra}`;

  const fallbackModel = String((await settingService.getRaw("FallbackModel").catch(() => "")) || "").trim();
  const maxRetries = Math.max(0, Math.min(3, await settingService.getNumber("AiMaxRetries", 1).catch(() => 1)));
  const timeoutMs = allow.L.timeoutMs;
  // V19: poore AI step ka waqt (retries samait) aur ek waqt mein kitni AI requests: Settings se
  const budgetMs = Math.max(5000, await settingService.getNumber("AiTotalBudgetMs", 22000).catch(() => 22000));
  const maxConcurrent = await settingService.getNumber("AiMaxConcurrent", 40).catch(() => 40);
  const queueTimeoutMs = await settingService.getNumber("AiQueueTimeoutMs", 8000).catch(() => 8000);

  // Koshishon ki list: primary (1 + retries), phir fallback model ek dafa
  const attempts = [];
  for (let i = 0; i <= maxRetries; i++) attempts.push({ model: base.model });
  if (fallbackModel && fallbackModel !== base.model) attempts.push({ model: fallbackModel, fallback: true });

  let usage = {}, lastErr = null, lastCode = "unknown";
  const started = Date.now();
  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    // Poori koshish budget se zyada nahi (customer intezar kar raha hai)
    const left = budgetMs - (Date.now() - started);
    if (i > 0 && left < 3000) break;
    const p = { ...base, model: a.model };
    if (lastCode === "truncated") p.max_completion_tokens = Math.round((p.max_completion_tokens || 800) * 1.6); // reasoning ne jagah kha li thi
    try {
      const json = await aiProvider.chatCompletion(p, { timeoutMs: Math.max(2000, Math.min(timeoutMs, left)), maxConcurrent, queueTimeoutMs: Math.min(queueTimeoutMs, Math.max(500, left - 2000)) });
      usage = addUsage(usage, json?.usage);
      checkJson(json);
      await record({ purpose, usage });
      if (allow.U) getUsage().then((U) => maybeWarn(allow.L, U)).catch(() => {});
      if (i > 0) console.warn(`[ai:${purpose}] ok after ${i + 1} attempts (model ${a.model}, last error ${lastCode})`);
      return { ok: true, json: { ...json, usage }, usage, attempts: i + 1, model: a.model };
    } catch (e) {
      lastErr = e; lastCode = classify(e);
      console.error(`[ai:${purpose}] attempt ${i + 1}/${attempts.length} (${a.model}) failed [${lastCode}]:`, e.message);
      if (lastCode === "queue_timeout") break; // server busy: dobara line mein lagna bekaar, rule-based jawab foran
      if (!RETRYABLE.has(lastCode)) {
        // auth / bad request: wohi model dobara bekaar, seedha fallback model par jao
        const fb = attempts.findIndex((x, j) => j > i && x.fallback);
        if (fb === -1) break;
        i = fb - 1;
        continue;
      }
      if (i < attempts.length - 1) {
        // 429: provider ka retry-after (zyada se zyada 4 sec), warna chhota intezar
        const wait = lastCode === "rate_limit" ? Math.min(4000, (e.retryAfter || 1.5) * 1000) : 600 * (i + 1);
        await sleep(wait);
      }
    }
  }

  await record({ purpose, usage, failed: true }).catch(() => {});
  if (lastCode === "rate_limit") {
    notificationService.notify({
      type: "AI_PROVIDER_RATE_LIMIT", level: "warning", title: "AI provider rate limit (429)", message: String(lastErr?.message || "").slice(0, 300),
      dedupeKey: `ai_429:${keys().day}:${new Date().getHours()}`, module: ACL_MODULES.AI_CONTROL,
    }).catch(() => {});
  }
  return { ok: false, limited: false, reason: "provider_error", error: lastCode, message: lastErr?.message };
};

/** AI Control dashboard */
const status = async () => {
  const L = await getLimits();
  const U = await getUsage({ fresh: true });
  const allow = await checkAllowance({});
  return {
    mode: allow.allowed ? "ai" : "normal",
    reason: allow.allowed ? null : allow.reason,
    switches: { enabled: L.enabled, understand: L.understandEnabled, reply: L.replyEnabled },
    limits: { dailyTokens: L.dailyTokens, monthlyTokens: L.monthlyTokens, dailyRequests: L.dailyRequests, perSession: L.perSession, warnAtPercent: L.warnAt },
    usage: {
      today: { ...U.day, tokenPercent: pct(U.day.totalTokens, L.dailyTokens), requestPercent: pct(U.day.requests, L.dailyRequests) },
      month: { ...U.month, tokenPercent: pct(U.month.totalTokens, L.monthlyTokens) },
    },
    queue: aiProvider.stats ? aiProvider.stats() : undefined,
  };
};

const history = async ({ period = "day", from, to, limit = 31 } = {}) => {
  const filter = { period };
  if (from || to) filter.key = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  return AiUsage.find(filter).sort({ key: -1 }).limit(Math.min(366, +limit || 31)).lean();
};

module.exports = { run, status, history, checkAllowance, getUsage, getLimits, flushUsage };
