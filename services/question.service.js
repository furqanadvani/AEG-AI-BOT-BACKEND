/** Question: Excel "Question" tab ka replacement. Write par bot config cache foran clear hota hai. */
const Question = require("../models/Question");
const { createCrudService } = require("../utils/crudFactory");
const configService = require("./config.service");

const LIST_FIELDS = ["aliases", "cities"];
const toList = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[|,;\n]/)).map((x) => String(x).trim()).filter(Boolean);
const clean = async (data) => {
  for (const f of LIST_FIELDS) if (data[f] !== undefined) data[f] = toList(data[f]);
  if (data.email) data.email = String(data.email).trim().toLowerCase();
  return data;
};

module.exports = createCrudService(Question, {
  entity: "Question",
  searchFields: ["field", "label", "whatToAsk", "country", "visaType"],
  filterFields: ["country", "visaType", "type", "field"],
  defaultSort: "order field",
  writableFields: ["country", "visaType", "field", "label", "whatToAsk", "whyWeAsk", "type", "options", "required", "askWhen", "order", "isActive"],
  beforeCreate: clean,
  beforeUpdate: clean,
  onChange: () => configService.invalidate(),
});
