/** Test helpers: in-memory repo, sample config, fake AI (bina MongoDB / Groq ke engine test) */
const { normPhone } = require("../services/engine/helpers");

const sampleConfig = (settings = {}) => ({
  settings: { BusinessName: "AEG Visa Consultancy", AssistantName: "Ayesha", AssistantGender: "female", MaxMsgsPerMinute: "30", FallbackAgentEmail: "team@aeg.test", ...settings },
  countries: [
    { name: "UAE", aliases: ["Dubai", "Emirates"], cities: ["Dubai", "Abu Dhabi"], active: true, note: "" },
    { name: "Saudi Arabia", aliases: ["KSA", "Saudi"], cities: ["Riyadh", "Jeddah"], active: true, note: "" },
    { name: "USA", aliases: ["US", "America"], cities: ["New York"], active: false, note: "" },
  ],
  visaTypes: [
    { country: "ALL", name: "Tourist", aliases: ["visit", "ghoomna", "holiday"], action: "Apply", note: "" },
    { country: "ALL", name: "Business", aliases: ["meeting"], action: "Apply", note: "" },
    { country: "ALL", name: "Work", aliases: ["job", "naukri"], action: "Refuse", note: "We do not process work visas." },
  ],
  questions: [
    { country: "ALL", visaType: "ALL", field: "country", label: "Country", ask: "Which country?", why: "", type: "country", options: "", required: true, askWhen: "", order: 1, active: true },
    { country: "ALL", visaType: "ALL", field: "visaType", label: "Visa type", ask: "Which visa type?", why: "", type: "visatype", options: "", required: true, askWhen: "", order: 2, active: true },
    { country: "ALL", visaType: "ALL", field: "travellers", label: "Number of travellers", ask: "How many people?", why: "", type: "number", options: "1-20", required: true, askWhen: "", order: 3, active: true },
    { country: "ALL", visaType: "ALL", field: "fullName", label: "Full name", ask: "Your name?", why: "", type: "name", options: "", required: true, askWhen: "", order: 90, active: true },
    { country: "ALL", visaType: "ALL", field: "whatsapp", label: "WhatsApp number", ask: "WhatsApp?", why: "", type: "phone", options: "", required: true, askWhen: "", order: 91, active: true },
  ],
  knowledge: [{ country: "UAE", visaType: "Tourist", topic: "Processing time", info: "UAE tourist visa usually takes 3-5 working days." }],
  agents: [{ country: "UAE", name: "Ali", email: "ali@aeg.test", id: "a1" }],
});

const createMemoryRepo = () => {
  const db = { sessions: {}, leads: [], queries: [], logs: [], customers: {} };
  const upsertCustomer = (name, phone) => {
    const p = normPhone(phone) || phone;
    if (!p) return null;
    if (!db.customers[p]) db.customers[p] = { _id: `c_${Object.keys(db.customers).length + 1}`, name, phone: p, leadsCount: 0 };
    return db.customers[p];
  };
  return {
    db,
    async getSession(sessionId) {
      const s = db.sessions[sessionId];
      if (!s) return { rows: [], meta: { aiCalls: 0, humanTakeover: false } };
      return { rows: [{ SessionID: sessionId, State: JSON.stringify(s.state), History: JSON.stringify(s.history), UpdatedAt: s.updatedAt }], meta: { aiCalls: s.aiCalls, humanTakeover: !!s.humanTakeover } };
    },
    async findLeadsByWhatsapp(w) {
      return db.leads.filter((l) => l.WhatsApp === w);
    },
    async createLead(row) {
      const c = upsertCustomer(row.FullName, row.WhatsApp);
      c.leadsCount++;
      db.leads.push({ ...row, customer: c._id });
      return { ok: true, leadId: row.LeadID, _id: `l_${db.leads.length}`, customer: c._id };
    },
    async createQuery(row) {
      db.queries.push(row);
      return { ok: true, queryId: row.QueryID };
    },
    async saveSession(session, { aiCallsInc = 0, turn = [] } = {}) {
      const prev = db.sessions[session.SessionID] || { aiCalls: 0, transcript: [] };
      db.sessions[session.SessionID] = { state: JSON.parse(session.State), history: JSON.parse(session.History), updatedAt: session.UpdatedAt, aiCalls: prev.aiCalls + aiCallsInc, transcript: [...prev.transcript, ...(turn || [])], humanTakeover: prev.humanTakeover };
    },
    async appendTranscript(sessionId, entries) {
      db.sessions[sessionId].transcript.push(...entries);
    },
    async appendLog(log) {
      db.logs.push(log);
    },
  };
};

/**
 * Fake AI: "Understand" ke liye chhota rule-based samajh (asli Groq jaisa JSON),
 * "Reply" ke liye THIS TURN instructions ka pehla hissa wapas.
 */
const createFakeAi = ({ limited = false } = {}) => {
  const calls = { understand: 0, reply: 0 };
  const understand = (u) => {
    const t = String(u.latest_message || "").toLowerCase();
    const out = { language: "en", intent: "other", updates: [], question: null, confirm: "none", status_lead_id: null, status_whatsapp: null, frustrated: false, unclear: false, meaning_guess: null };
    if (/^(hi|hello|salam)/.test(t)) out.intent = "greeting";
    if (/visa|apply/.test(t)) out.intent = "apply";
    if (/dubai|uae/.test(t)) out.updates.push({ field: "country", value: "UAE" });
    if (/tourist|visit/.test(t)) out.updates.push({ field: "visaType", value: "Tourist" });
    if (/status/.test(t)) out.intent = "status";
    const ref = t.match(/aeg-[a-z0-9]+/);
    if (ref) { out.status_lead_id = ref[0].toUpperCase(); out.intent = "status"; }
    const ph = t.match(/03\d{2}\s?\d{7}/);
    if (ph && out.intent === "status") out.status_whatsapp = ph[0];
    if (u.stage === "confirming" && /^(yes|haan|ok|confirm)/.test(t)) out.confirm = "yes";
    if (!out.updates.length && u.last_asked && out.intent !== "status" && out.confirm === "none") { out.intent = "providing_info"; out.updates.push({ field: u.last_asked, value: u.latest_message }); }
    return out;
  };
  return {
    calls,
    async run({ purpose, payload }) {
      if (limited) return { ok: false, limited: true, reason: "daily_token_limit" };
      calls[purpose] = (calls[purpose] || 0) + 1;
      const user = JSON.parse(payload.messages[1].content);
      let content;
      if (purpose === "understand") content = JSON.stringify(understand(user));
      else {
        const sys = payload.messages[0].content;
        const turn = (sys.split("THIS TURN, in this order:")[1] || "").split("Return JSON only")[0].trim();
        content = JSON.stringify({ reply: `[AI] ${turn.slice(0, 300)}`, unanswered_question: null });
      }
      return { ok: true, json: { choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } } };
    },
  };
};

const makeDeps = ({ repo = createMemoryRepo(), ai = createFakeAi(), settings } = {}) => ({
  repo,
  ai,
  config: { getConfig: async () => sampleConfig(settings) },
  hooks: { onLeadCreated: async () => {}, onHumanRequest: async () => {}, onHumanTakeoverMessage: async () => {} },
});

module.exports = { sampleConfig, createMemoryRepo, createFakeAi, makeDeps };
