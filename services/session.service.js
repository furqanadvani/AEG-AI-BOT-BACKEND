const Session = require("../models/Session");
const AppError = require("../utils/AppError");
const { createCrudService, assertId } = require("../utils/crudFactory");

const crud = createCrudService(Session, {
  entity: "Session",
  searchFields: ["sessionId", "state.data.fullName", "state.data.whatsapp"],
  filterFields: ["stage", "language", "channel", "customer", "humanTakeover"],
  defaultSort: "-lastMessageAt",
  populate: { path: "customer", select: "name phone email" },
  select: "-transcript", // list / detail halki rahe; poori chat alag endpoint se
  writableFields: ["humanTakeover", "isActive"],
});

/** Session ki memory saaf (customer naye sire se shuru kare) */
const reset = async (id) => {
  assertId(id);
  const s = await Session.findByIdAndUpdate(
    id,
    { $set: { state: {}, history: [], stage: "collecting", aiCalls: 0 }, $push: { transcript: { role: "system", text: "Conversation memory was reset by an admin.", at: new Date() } } },
    { returnDocument: "after", projection: { transcript: 0 } }
  ).lean();
  if (!s) throw AppError.notFound("Session not found");
  return s;
};

/** Agent baat sambhale: bot is session mein jawab nahi dega */
const setTakeover = async (id, value) => {
  assertId(id);
  const s = await Session.findByIdAndUpdate(
    id,
    { $set: { humanTakeover: !!value }, $push: { transcript: { role: "system", text: value ? "An agent took over this conversation. The bot is paused." : "The agent handed the conversation back to the bot.", at: new Date() } } },
    { returnDocument: "after", projection: { transcript: 0 } }
  ).lean();
  if (!s) throw AppError.notFound("Session not found");
  return s;
};

/**
 * Poori baat-cheet. Purane / import kiye sessions mein transcript nahi hota:
 * tab chat logs (har turn) se, warna engine ki short history se.
 */
const getTranscript = async (id) => {
  assertId(id);
  const s = await Session.findById(id).select("sessionId transcript history").lean();
  if (!s) throw AppError.notFound("Session not found");
  if (s.transcript?.length) return { source: "transcript", complete: true, messages: s.transcript };

  const ChatLog = require("../models/ChatLog");
  const logs = await ChatLog.find({ sessionId: s.sessionId }).sort({ createdAt: 1 }).limit(2000).lean();
  if (logs.length) {
    const messages = [];
    for (const l of logs) {
      if (l.message) messages.push({ role: "user", text: l.message, at: l.createdAt });
      if (l.reply) messages.push({ role: "assistant", text: l.reply, at: l.createdAt, meta: { next: l.next, language: l.language, replyAI: l.replyAI, tokens: l.totalTokens, aiLimited: l.aiLimited } });
    }
    return { source: "logs", complete: false, messages };
  }
  return { source: "history", complete: false, messages: (s.history || []).map((h) => ({ role: h.role === "assistant" ? "assistant" : "user", text: h.text })) };
};

module.exports = { ...crud, reset, setTakeover, getTranscript };
