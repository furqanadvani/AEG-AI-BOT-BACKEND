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

// V19: kai servers / PM2 cluster par ek session ke messages phir bhi line se: Mongo lease lock (repo.acquireLock)
const DISTRIBUTED = /^(1|true|yes)$/i.test(String(process.env.DISTRIBUTED_SESSION_LOCK || "")) || !!process.env.NODE_APP_INSTANCE || /^(1|true|yes)$/i.test(String(process.env.CLUSTER_WORKER || ""));
const withSessionLock = async (key, deps, fn) => withLock(key, async () => {
  if (!DISTRIBUTED || !deps.repo.acquireLock) return fn();
  const token = await deps.repo.acquireLock(key).catch(() => null); // na mile to bhi chalao (customer ruke nahi)
  try { return await fn(); } finally { if (token) deps.repo.releaseLock(key, token).catch(() => {}); }
});

// V19: DB likhne mein waqti masla (network blip / failover) -> ek dafa dobara. Validation error par dobara bekaar
const TRANSIENT = (e) => !(e && (e.name === "ValidationError" || e.name === "CastError" || e.code === 11000 && /leadId|queryId/.test(String(e.message))));
const retryOnce = async (fn) => {
  try { return await fn(); }
  catch (e) {
    if (!TRANSIENT(e)) throw e;
    await new Promise((r) => setTimeout(r, 250));
    return fn();
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
  const msg0 = extractMessage(raw);
  // V19: koi bhi achanak error customer tak "technical issue" ban kar na jaye: ek dafa poora turn dobara, phir narm jawab
  try {
    return await withSessionLock(msg0.sessionId, deps, () => processTurn(raw, msg0, opts, deps, channel));
  } catch (e) {
    console.error("Workflow turn failed, retrying once:", e.message);
    try {
      return await withSessionLock(msg0.sessionId, deps, () => processTurn(raw, { ...msg0, t0: Date.now() }, opts, deps, channel));
    } catch (e2) {
      console.error("Workflow turn failed twice:", e2.message);
      const l = detectLang(msg0.text);
      const SOFT = {
        en: "Thank you for your message. Could you send that once more? I want to make sure I get it exactly right.",
        roman_ur: "Aapka message mil gaya, shukriya. Kya aap ise ek dafa dobara bhej denge, taake main aapki baat bilkul theek samajh sakoon?",
        ur: "آپ کا پیغام مل گیا، شکریہ۔ کیا آپ اسے ایک دفعہ دوبارہ بھیج دیں گے، تاکہ میں آپ کی بات بالکل ٹھیک سمجھ سکوں؟",
      };
      return { reply: SOFT[l] || SOFT.en, replyPlain: SOFT[l] || SOFT.en, sessionId: msg0.sessionId, next: "recovered", language: l, leadId: null, aiLimited: false, aiReason: null, aiFailed: true };
    }
  }
};

const processTurn = async (raw, msg, opts, deps, channel) => {
  {
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
    let aiLimited = false, aiFailed = false, aiCalls = 0, aiReason = null, aiError = "";
    if (ctx.needUnderstand && ctx.understandPayload) {
      const r = await deps.ai.run({ purpose: "understand", payload: ctx.understandPayload, sessionAiCalls: meta.aiCalls });
      if (r.ok) { R.set("AI Understand", r.json); aiCalls++; }
      else if (r.limited) { aiLimited = true; aiReason = r.reason; }
      else { aiError = `understand:${r.error || "unknown"}`; } // Guard khud rule-based samajh leta hai
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
          createdLead = await retryOnce(() => deps.repo.createLead(dc.lead, { channel, data: (dc.state && dc.state.data) || {} }));
          R.set("Append Lead", createdLead);
        } catch (e) {
          console.error("Create lead failed:", e.message);
          R.set("Append Lead", { error: e.message });
        }
        R.run("Lead Created", leadCreated);
        last = "Lead Created";
      }
    } else if (g.sideEffect === "refused_lead" && g.lead) {
      // V19: jo hum process nahi karte us ki demand bhi lead (status "Not processed"); dobara aaye to wahi purani
      let ref = "";
      try {
        const n = (v) => String(v || "").trim().toLowerCase();
        const prev = (await deps.repo.findLeadsByWhatsapp(g.lead.WhatsApp).catch(() => []))
          .find((r) => n(r.Status) === n(g.lead.Status) && n(r.Country) === n(g.lead.Country) && n(r.VisaType) === n(g.lead.VisaType));
        if (prev) ref = prev.LeadID;
        else {
          createdLead = await retryOnce(() => deps.repo.createLead(g.lead, { channel, data: { ...((g.state && g.state.data) || {}), refused: true }, refused: true }));
          if (createdLead) createdLead.refused = true;
          ref = createdLead?.leadId || "";
        }
      } catch (e) {
        console.error("Create refused lead failed:", e.message);
      }
      const gj = R.outputs["Guard"][0].json;
      gj.plan = { ...gj.plan, next: { ...gj.plan.next, type: "refused_lead_created", referenceId: ref } };
    } else if (g.sideEffect === "query" && g.query) {
      try {
        createdQuery = await retryOnce(() => deps.repo.createQuery(g.query, { channel }));
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
      else {
        // Retry ke baad bhi fail: customer ko "technical masla" nahi, code wala natural jawab (Finalize)
        aiFailed = true; br.aiFailed = true;
        aiError = [aiError, `reply:${r.error || "unknown"}`].filter(Boolean).join(",");
      }
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
        meta: { next: fin.log?.Next, language: fin.log?.Language, replyAI: fin.log?.ReplyAI, tokens: fin.log?.TotalTokens, aiLimited, aiError: aiError || undefined, leadId: createdLead?.leadId || undefined },
      },
    ];
    await retryOnce(() => deps.repo.saveSession(fin.session, { channel, aiCallsInc: aiCalls, turn, customerLinked: !!meta.customer }));

    // 9) Background: unanswered query, log, email, CRM, notifications
    const background = (async () => {
      const jobs = [];
      if (fin.logUnanswered && fin.query) jobs.push(deps.repo.createQuery(fin.query, { channel }).then((q) => { createdQuery = createdQuery || q; }));
      jobs.push(deps.repo.appendLog(fin.log, { channel, aiLimited, aiError }));
      if (deps.hooks) {
        if (createdLead && createdLead.ok) jobs.push(deps.hooks.onLeadCreated({ lead: createdLead, email: !createdLead.refused && fin.sendEmail ? fin.email : null, channel, refused: !!createdLead.refused }));
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
      aiFailed,
    };
    if (opts.debug) out.debug = { notes: (g.plan && g.plan.notes) || [], refused: (fin.session && fin.session.State && (() => { try { return JSON.parse(fin.session.State).refused || null; } catch { return null; } })()) || null, captureRefused: !/^(no|false|0|off)$/i.test(String((cfg.settings || {}).CaptureRefusedLeads ?? '').trim()), skipReason: ctx.skipReason, intent: fin.log?.Intent, sideEffect: g.sideEffect, stage: fin.session?.Stage, tokens: fin.log?.TotalTokens, replyAI: fin.log?.ReplyAI, aiError };
    return out;
  }
};

module.exports = { handleMessage, extractMessage };