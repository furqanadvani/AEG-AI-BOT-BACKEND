const Query = require("../models/Query");
const Knowledge = require("../models/Knowledge");
const AppError = require("../utils/AppError");
const { createCrudService, assertId } = require("../utils/crudFactory");
const { QUERY_STATUSES } = require("../constants/workflow");

const crud = createCrudService(Query, {
  entity: "Query",
  searchFields: ["queryId", "question", "fullName", "whatsapp", "country"],
  filterFields: ["type", "status", "country", "visaType", "assignedAgent", "customer"],
  populate: [{ path: "customer", select: "name phone" }, { path: "lead", select: "leadId status" }],
  writableFields: ["type", "question", "answer", "country", "visaType", "fullName", "whatsapp", "assignedAgent", "status", "isActive"],
  beforeCreate: async (data) => ({ ...data, queryId: "Q-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase() }),
});

/**
 * Team jawab de: status update + (optional) jawab ko Knowledge mein daal do,
 * taake agli dafa bot khud jawab de sake (self-learning loop).
 */
const answer = async (id, { answer: text, status = "Answered", addToKnowledge = false, topic }, user) => {
  assertId(id);
  if (!QUERY_STATUSES.includes(status)) throw AppError.badRequest(`Invalid status. Allowed: ${QUERY_STATUSES.join(", ")}`);
  const q = await Query.findById(id);
  if (!q) throw AppError.notFound("Query not found");
  if (text !== undefined) q.answer = String(text).trim();
  q.status = status;
  q.answeredBy = user?.id || null;
  q.answeredAt = new Date();
  let knowledge = null;
  if (addToKnowledge) {
    if (!q.answer) throw AppError.badRequest("answer is required to add to knowledge");
    knowledge = await Knowledge.create({
      country: q.country || "ALL", visaType: q.visaType || "ALL",
      topic: String(topic || q.question).replace(/\s*\(Lead [^)]+\)\s*$/, "").slice(0, 200), info: q.answer,
    });
    q.addToKnowledge = true;
    require("./config.service").invalidate();
  }
  await q.save();
  return { query: await crud.getById(id), knowledge };
};

module.exports = { ...crud, answer };
