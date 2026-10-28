const ChatLog = require("../models/ChatLog");
const { createCrudService, createCrudController } = require("../utils/crudFactory");

const service = createCrudService(ChatLog, {
  entity: "Chat log",
  searchFields: ["sessionId", "message", "reply"],
  filterFields: ["sessionId", "language", "intent", "next", "skipReason", "replyAI", "channel", "aiLimited"],
});

module.exports = createCrudController(service, { entity: "Chat log" });
