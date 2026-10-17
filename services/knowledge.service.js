/** Knowledge: Excel "Knowledge" tab ka replacement. Write par bot config cache foran clear hota hai. */
const Knowledge = require("../models/Knowledge");
const { createCrudService } = require("../utils/crudFactory");
const configService = require("./config.service");

const LIST_FIELDS = ["aliases", "cities"];
const toList = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[|,;\n]/)).map((x) => String(x).trim()).filter(Boolean);
const clean = async (data) => {
  for (const f of LIST_FIELDS) if (data[f] !== undefined) data[f] = toList(data[f]);
  if (data.email) data.email = String(data.email).trim().toLowerCase();
  return data;
};

module.exports = createCrudService(Knowledge, {
  entity: "Knowledge",
  searchFields: ["topic", "info", "country", "visaType"],
  filterFields: ["country", "visaType"],
  defaultSort: "country visaType topic",
  writableFields: ["country", "visaType", "topic", "info", "isActive"],
  beforeCreate: clean,
  beforeUpdate: clean,
  onChange: () => configService.invalidate(),
});
