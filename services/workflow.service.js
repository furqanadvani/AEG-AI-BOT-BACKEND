/**
 * Visa AI Workflow (n8n "AEG Visa AI Agent V18.8" ka backend version).
 *
 *  Chat Trigger -> Extract Message -> Get Session -> Config -> Build Context
 *    -> [AI Understand] -> Guard -> (Status lookup | Dup check + Lead | Query)
 *    -> Build Reply -> [AI Reply] -> Finalize -> Respond
 *    -> (Unanswered query, Save Session, Log, Email agent, CRM push)
 *
 * Engine steps (services/engine/*) n8n code nodes se 1:1 port hain. Yeh file sirf "wiring" hai.
 * Dependencies inject hoti hain (repo / ai / config) taake tests bina DB/AI ke chal sakein.
 */
const { createRuntime } = require("./engine/runtime");
const buildContext = require("./engine/buildContext");
const guard = require("./engine/guard");
const statusResult = require("./engine/statusResult");
const dupCheck = require("./engine/dupCheck");
const leadCreated = require("./engine/leadCreated");
const queryLogged = require("./engine/queryLogged");
const buildReply = require("./engine/buildReply");
const finalize = require("./engine/finalize");
const { detectLang } = require("./engine/helpers");

// ---- per-session lock: ek session ke messages line se process hon (WhatsApp bursts) ----
const locks = new Map();
const withLock = async (key, fn) => {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const mine = new Promise((r) => (release = r));
  const chain = prev.then(() => mine);
  locks.set(key, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chain) locks.delete(key);
  }
};

const extractMessage = (raw = {}) => {
  const text = String(raw.chatInput ?? raw.message ?? raw.text ?? "").replace(/[ \t]+/g, " ").trim().slice(0, 1500);
  const sessionId = String(raw.sessionId ?? raw.senderId ?? raw.from ?? "").trim().slice(0, 120) || "anon-" + Date.now();
  return { sheetId: "", sessionId, text, receivedAt: new Date().toISOString(), t0: Date.now() };
};

const BOT_OFF = {
  en: "Thank you for your message. Our team will get back to you shortly.",
  roman_ur: "Aapka message mil gaya hai, shukriya. Hamari team jald aap se rabta karegi.",
  ur: "آپ کا پیغام موصول ہو گیا ہے، شکریہ۔ ہماری ٹیم جلد آپ سے رابطہ کرے گی۔",
};

const defaultDeps = () => ({
  repo: require("./workflow.repository"),
  ai: require("./ai.service"),
  config: require("./config.service"),
  hooks: require("./workflow.hooks"),
});

/**
 * Ek customer message process karna.
 * @param raw   { sessionId, text | chatInput | message, channel? }
 * @param opts  { channel, deps, awaitBackground, debug }
 * @returns     { reply, sessionId, next, language, leadId, aiLimited, ... }
 */
const handleMessage = async (raw, opts = {}) => {
  const deps = { ...defaultDeps(), ...(opts.deps || {}) };
  const channel = opts.channel || raw.channel || "web";
  const msg = extractMessage(raw);

  return withLock(msg.sessionId, async () => {
    const cfg = await deps.config.getConfig();
    const S = cfg.settings || {};
    const { rows, meta } = await deps.repo.getSession(msg.sessionId);

    // Agent ne baat sambhal li hai: bot chup (message history mein phir bhi jata hai hooks se)
    if (meta.humanTakeover) {
      if (deps.repo.appendTranscript) await deps.repo.appendTranscript(msg.sessionId, [{ role: "user", text: msg.text, at: new Date(msg.t0) }], { channel }).catch(() => {});
      if (deps.hooks?.onHumanTakeoverMessage) await deps.hooks.onHumanTakeoverMessage({ msg, channel }).catch(() => {});
      return { reply: null, sessionId: msg.sessionId, humanTakeover: true };
    }

    // Bot OFF: seedha template
    if (/^(no|false|0|off)$/i.test(String(S.BotEnabled || "").trim())) {
      const l = detectLang(msg.text);
      return { reply: BOT_OFF[l] || BOT_OFF.en, sessionId: msg.sessionId, botDisabled: true };
    }

    const R = createRuntime({ cfg });
    R.set("Extract Message", msg);
    R.set("Get Session", rows);

    // 1) Build Context
    const ctx = R.run("Build Context", buildContext);

    // 2) AI #1 Understand
    let aiLimited = false, aiCalls = 0, aiReason = null;
    if (ctx.needUnderstand && ctx.understandPayload) {
      const r = await deps.ai.run({ purpose: "understand", payload: ctx.understandPayload, sessionAiCalls: meta.aiCalls });
      if (r.ok) { R.set("AI Understand", r.json); aiCalls++; }
      else if (r.limited) { aiLimited = true; aiReason = r.reason; }
    }

    // 3) Guard
    const g = R.run("Guard", guard);

    // 4) Side effects (Sheets nodes ki jagah repo)
    let last = "Guard", createdLead = null, createdQuery = null;
    if (g.sideEffect === "status") {
      const leads = await deps.repo.findLeadsByWhatsapp(g.statusQuery?.whatsapp).catch(() => []);
      R.set("Lookup Leads (Status)", leads);
      R.run("Status Result", statusResult, "Lookup Leads (Status)");
      last = "Status Result";
    } else if (g.sideEffect === "submit") {
      const leads = await deps.repo.findLeadsByWhatsapp(g.lead?.WhatsApp).catch(() => []);
      R.set("Lookup Leads (Duplicate)", leads);
      const dc = R.run("Dup Check", dupCheck, "Lookup Leads (Duplicate)");
      if (dc.isDuplicate) last = "Dup Check";
      else {
        try {
          createdLead = await deps.repo.createLead(dc.lead, { channel, data: (dc.state && dc.state.data) || {} });
          R.set("Append Lead", createdLead);
        } catch (e) {
          console.error("Create lead failed:", e.message);
          R.set("Append Lead", { error: e.message });
        }
        R.run("Lead Created", leadCreated);
        last = "Lead Created";
      }
    } else if (g.sideEffect === "query" && g.query) {
      try {
        createdQuery = await deps.repo.createQuery(g.query, { channel });
        R.set("Append Query", createdQuery);
      } catch (e) {
        console.error("Create query failed:", e.message);
        R.set("Append Query", { error: e.message });
      }
      R.run("Query Logged", queryLogged);
      last = "Query Logged";
    }

    // AI limit flag aage tak (Build Reply ...g spread karta hai -> Finalize)
    R.outputs[last][0].json.aiLimited = aiLimited;

    // 5) Build Reply
    const br = R.run("Build Reply", buildReply, last);

    // 6) AI #2 Reply
    if (br.needReplyAI && br.replyPayload) {
      const r = await deps.ai.run({ purpose: "reply", payload: br.replyPayload, sessionAiCalls: meta.aiCalls + aiCalls });
      if (r.ok) { R.set("AI Reply", r.json); aiCalls++; }
      else if (r.limited) { aiLimited = true; aiReason = aiReason || r.reason; br.aiLimited = true; }
    }

    // 7) Finalize
    const fin = R.run("Finalize", finalize);

    // 8) Persist: session pehle (agla message sahi state parhe)
    const turn = [
      { role: "user", text: msg.text, at: new Date(msg.t0) },
      {
        role: "assistant",
        text: String(fin.reply || "").replace(/ {2}\n/g, "\n"),
        at: new Date(),
        meta: { next: fin.log?.Next, language: fin.log?.Language, replyAI: fin.log?.ReplyAI, tokens: fin.log?.TotalTokens, aiLimited, leadId: createdLead?.leadId || undefined },
      },
    ];
    await deps.repo.saveSession(fin.session, { channel, aiCallsInc: aiCalls, turn });

    // 9) Background: unanswered query, log, email, CRM, notifications
    const background = (async () => {
      const jobs = [];
      if (fin.logUnanswered && fin.query) jobs.push(deps.repo.createQuery(fin.query, { channel }).then((q) => { createdQuery = createdQuery || q; }));
      jobs.push(deps.repo.appendLog(fin.log, { channel, aiLimited }));
      if (deps.hooks) {
        if (createdLead && createdLead.ok) jobs.push(deps.hooks.onLeadCreated({ lead: createdLead, email: fin.sendEmail ? fin.email : null, channel }));
        if (g.sideEffect === "query" && g.query && g.query.Type === "HUMAN" && createdQuery) jobs.push(deps.hooks.onHumanRequest({ query: g.query }));
      }
      const res = await Promise.allSettled(jobs);
      for (const r of res) if (r.status === "rejected") console.error("Workflow background job failed:", r.reason?.message || r.reason);
    })();
    if (opts.awaitBackground) await background;

    const out = {
      reply: fin.reply,
      replyPlain: String(fin.reply || "").replace(/ {2}\n/g, "\n"),
      sessionId: msg.sessionId,
      next: fin.log?.Next || null,
      language: fin.log?.Language || null,
      leadId: createdLead?.leadId || null,
      aiLimited,
      aiReason,
    };
    if (opts.debug) out.debug = { skipReason: ctx.skipReason, intent: fin.log?.Intent, sideEffect: g.sideEffect, stage: fin.session?.Stage, tokens: fin.log?.TotalTokens, replyAI: fin.log?.ReplyAI };
    return out;
  });
};

module.exports = { handleMessage, extractMessage };
