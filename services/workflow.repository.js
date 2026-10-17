/**
 * Workflow ka data layer (pehle Google Sheets nodes). Engine sirf in functions ko call karta hai,
 * isliye tests mein in-memory repo inject ho sakta hai aur DB badalna ho to sirf yeh file.
 */
const Session = require("../models/Session");
const Lead = require("../models/Lead");
const Query = require("../models/Query");
const ChatLog = require("../models/ChatLog");
const Agent = require("../models/Agent");
const customerService = require("./customer.service");

const MAX_TRANSCRIPT = 2000; // ek session ke zyada se zyada messages

// Mongo lead -> Sheet row shape (engine "Status Result" / "Dup Check" isi format ko parhte hain)
const leadToRow = (l) => ({
  LeadID: l.leadId, CreatedAt: l.createdAt ? new Date(l.createdAt).toISOString() : "", Status: l.status, AssignedAgent: l.assignedAgent,
  FullName: l.fullName, WhatsApp: l.whatsapp, Country: l.country, VisaType: l.visaType, TravelDate: l.travelDate, Duration: l.duration,
  Travellers: l.travellers, Relationship: l.relationship, BankStatement: l.bankStatement, CityToStay: l.cityToStay,
  OtherDetails: l.otherDetails, OpenQuestions: l.openQuestions, Summary: l.summary, Language: l.language, SessionID: l.sessionId,
  LastUpdated: l.updatedAt ? new Date(l.updatedAt).toISOString() : "",
});

const rowToLead = (r) => ({
  leadId: r.LeadID, status: r.Status || "New", assignedAgent: r.AssignedAgent || "Unassigned", fullName: r.FullName, whatsapp: r.WhatsApp,
  country: r.Country, visaType: r.VisaType, travelDate: r.TravelDate, duration: r.Duration, travellers: r.Travellers, relationship: r.Relationship,
  bankStatement: r.BankStatement, cityToStay: r.CityToStay, otherDetails: r.OtherDetails, openQuestions: r.OpenQuestions, summary: r.Summary,
  language: r.Language, sessionId: r.SessionID,
});

const rowToQuery = (q) => ({
  queryId: q.QueryID, type: q.Type, question: q.Question, country: q.Country, visaType: q.VisaType, fullName: q.FullName,
  whatsapp: q.WhatsApp, assignedAgent: q.AssignedAgent, status: q.Status || "Open", sessionId: q.SessionID,
});

module.exports = {
  leadToRow,

  async getSession(sessionId) {
    const s = await Session.findOne({ sessionId }).lean();
    if (!s) return { rows: [], meta: { aiCalls: 0, humanTakeover: false, customer: null, exists: false } };
    return {
      rows: [{ SessionID: s.sessionId, Stage: s.stage, Language: s.language, State: JSON.stringify(s.state || {}), History: JSON.stringify(s.history || []), CreatedAt: s.createdAt, UpdatedAt: new Date(s.updatedAt).toISOString() }],
      meta: { aiCalls: s.aiCalls || 0, humanTakeover: !!s.humanTakeover, customer: s.customer || null, exists: true },
    };
  },

  async findLeadsByWhatsapp(whatsapp) {
    if (!whatsapp) return [];
    const leads = await Lead.find({ whatsapp: String(whatsapp).trim() }).sort({ createdAt: -1 }).limit(50).lean();
    return leads.map(leadToRow);
  },

  /** Lead + Customer profile (ek dafa) */
  async createLead(row, { channel = "web", data = {} } = {}) {
    const customer = await customerService.upsertFromBot({
      name: row.FullName, phone: row.WhatsApp, language: row.Language, channel, sessionId: row.SessionID,
    });
    const agent = row.AssignedAgent && row.AssignedAgent !== "Unassigned" ? await Agent.findOne({ name: row.AssignedAgent, isActive: true }).lean() : null;
    const lead = await Lead.create({ ...rowToLead(row), customer: customer?._id || null, agent: agent?._id || null, data, channel });
    if (customer) await customerService.touchLead(customer._id);
    return { ok: true, leadId: lead.leadId, _id: lead._id, customer: customer?._id || null };
  },

  async createQuery(row, { channel = "web" } = {}) {
    let customer = null;
    if (row.WhatsApp && row.FullName) {
      customer = await customerService.upsertFromBot({ name: row.FullName, phone: row.WhatsApp, channel, sessionId: row.SessionID });
    }
    const leadMatch = String(row.Question || "").match(/\(Lead ([A-Z0-9-]+)\)/);
    const lead = leadMatch ? await Lead.findOne({ leadId: leadMatch[1] }).select("_id").lean() : null;
    const q = await Query.create({ ...rowToQuery(row), customer: customer?._id || null, lead: lead?._id || null });
    if (customer) await customerService.touchQuery(customer._id);
    return { ok: true, queryId: q.queryId, _id: q._id };
  },

  async saveSession(session, { channel = "web", aiCallsInc = 0, turn = null } = {}) {
    const state = typeof session.State === "string" ? JSON.parse(session.State || "{}") : session.State || {};
    const history = typeof session.History === "string" ? JSON.parse(session.History || "[]") : session.History || [];
    const update = {
      $set: { stage: session.Stage, language: session.Language, state, history, lastMessageAt: new Date(), channel },
      $setOnInsert: { sessionId: session.SessionID },
      $inc: { aiCalls: aiCallsInc, messagesCount: 1 },
    };
    if (turn) update.$push = { transcript: { $each: turn, $slice: -MAX_TRANSCRIPT } };
    // Naam + WhatsApp mil gaya to Customer profile se link (ek hi profile, dobara nahi banti)
    const d = state.data || {};
    if (d.whatsapp && d.fullName) {
      const c = await customerService.upsertFromBot({ name: d.fullName, phone: d.whatsapp, language: session.Language, channel, sessionId: session.SessionID });
      if (c) update.$set.customer = c._id;
    }
    await Session.updateOne({ sessionId: session.SessionID }, update, { upsert: true });
  },

  /** Takeover ke dauran customer ka message (bot jawab nahi deta, lekin chat mein dikhna chahiye) */
  async appendTranscript(sessionId, entries, { channel = "web" } = {}) {
    await Session.updateOne(
      { sessionId },
      { $push: { transcript: { $each: entries, $slice: -MAX_TRANSCRIPT } }, $set: { lastMessageAt: new Date(), channel }, $inc: { messagesCount: 1 } }
    );
  },

  async appendLog(log, { channel = "web", aiLimited = false } = {}) {
    await ChatLog.create({
      sessionId: log.SessionID, channel, language: log.Language, intent: log.Intent, next: log.Next, skipReason: log.SkipReason,
      ai1In: log.AI1_In, ai1Out: log.AI1_Out, ai2In: log.AI2_In, ai2Out: log.AI2_Out, totalTokens: log.TotalTokens,
      latencyMs: Number(log.LatencyMs) || 0, feedback: String(log.Feedback || ""), replyAI: log.ReplyAI, message: log.Message, reply: log.Reply, aiLimited,
    });
  },

  async getLead(leadId) {
    return Lead.findOne({ leadId }).lean();
  },
};
