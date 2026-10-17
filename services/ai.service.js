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

const getUsage = async () => {
  const k = keys();
  const [day, month] = await Promise.all([
    AiUsage.findOne({ period: "day", key: k.day }).lean(),
    AiUsage.findOne({ period: "month", key: k.month }).lean(),
  ]);
  const z = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, failures: 0, blocked: 0, byPurpose: {} };
  return { day: { ...z, ...(day || {}), key: k.day }, month: { ...z, ...(month || {}), key: k.month } };
};

const pct = (used, limit) => (limit > 0 ? Math.round((used / limit) * 100) : 0);

/** Kya abhi AI call ho sakti hai? { allowed, reason } */
const checkAllowance = async ({ purpose, sessionAiCalls = 0 } = {}) => {
  const L = await getLimits();
  if (!L.enabled) return { allowed: false, reason: "ai_disabled" };
  if (purpose === "understand" && !L.understandEnabled) return { allowed: false, reason: "understand_disabled" };
  if (purpose === "reply" && !L.replyEnabled) return { allowed: false, reason: "reply_disabled" };
  if (L.perSession > 0 && sessionAiCalls >= L.perSession) return { allowed: false, reason: "session_limit" };

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

const record = async ({ purpose, usage = {}, failed = false, blocked = false }) => {
  const k = keys();
  const p = usage.prompt_tokens || 0, c = usage.completion_tokens || 0;
  const t = usage.total_tokens || p + c;
  const inc = {
    requests: blocked ? 0 : 1, promptTokens: p, completionTokens: c, totalTokens: t,
    failures: failed ? 1 : 0, blocked: blocked ? 1 : 0,
    [`byPurpose.${purpose}.requests`]: blocked ? 0 : 1, [`byPurpose.${purpose}.tokens`]: t,
  };
  await Promise.all([
    AiUsage.updateOne({ period: "day", key: k.day }, { $inc: inc }, { upsert: true }),
    AiUsage.updateOne({ period: "month", key: k.month }, { $inc: inc }, { upsert: true }),
  ]);
};

/**
 * Engine ki AI call. Kabhi throw nahi karta.
 * Return: { ok, json, usage, limited, reason }
 *   json = provider ka raw response ({ choices, usage }) bilkul n8n HTTP node jaisa
 */
const run = async ({ purpose, payload, sessionAiCalls = 0 }) => {
  try {
    const allow = await checkAllowance({ purpose, sessionAiCalls });
    if (!allow.allowed) {
      await record({ purpose, blocked: true }).catch(() => {});
      if (allow.L) notifyLimit(allow.reason, allow.L, allow.U).catch(() => {});
      return { ok: false, limited: true, reason: allow.reason };
    }

    // Backend se control: max tokens + extra prompt hidayat
    const p = JSON.parse(JSON.stringify(payload));
    const maxTok = await settingService.getNumber(PURPOSE_MAXTOK[purpose], 0);
    if (maxTok > 0) p.max_completion_tokens = maxTok;
    const extra = await settingService.getRaw(purpose === "understand" ? "UnderstandPromptAppend" : "ReplyPromptAppend");
    if (extra && p.messages?.[0]?.role === "system") p.messages[0].content += `\n\nADDITIONAL INSTRUCTIONS FROM ADMIN:\n${extra}`;

    const json = await aiProvider.chatCompletion(p, { timeoutMs: allow.L.timeoutMs });
    await record({ purpose, usage: json?.usage || {} });
    // Warning check (fire and forget)
    getUsage().then((U) => maybeWarn(allow.L, U)).catch(() => {});
    return { ok: true, json, usage: json?.usage || {} };
  } catch (e) {
    console.error(`[ai:${purpose}] failed:`, e.message);
    await record({ purpose, failed: true }).catch(() => {});
    if (e.status === 429) {
      notificationService.notify({
        type: "AI_PROVIDER_RATE_LIMIT", level: "warning", title: "AI provider rate limit (429)", message: e.message.slice(0, 300),
        dedupeKey: `ai_429:${keys().day}:${new Date().getHours()}`, module: ACL_MODULES.AI_CONTROL,
      }).catch(() => {});
    }
    return { ok: false, limited: false, reason: "provider_error", error: e.message };
  }
};

/** AI Control dashboard */
const status = async () => {
  const L = await getLimits();
  const U = await getUsage();
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
  };
};

const history = async ({ period = "day", from, to, limit = 31 } = {}) => {
  const filter = { period };
  if (from || to) filter.key = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  return AiUsage.find(filter).sort({ key: -1 }).limit(Math.min(366, +limit || 31)).lean();
};

module.exports = { run, status, history, checkAllowance, getUsage, getLimits };
