/** Agent: Excel "Agent" tab ka replacement. Write par bot config cache foran clear hota hai. */
const Agent = require("../models/Agent");
const { createCrudService } = require("../utils/crudFactory");
const configService = require("./config.service");

const LIST_FIELDS = ["aliases", "cities"];
const toList = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[|,;\n]/)).map((x) => String(x).trim()).filter(Boolean);
const clean = async (data) => {
  for (const f of LIST_FIELDS) if (data[f] !== undefined) data[f] = toList(data[f]);
  if (data.email) data.email = String(data.email).trim().toLowerCase();
  return data;
};

module.exports = createCrudService(Agent, {
  entity: "Agent",
  searchFields: ["name", "email", "country", "phone"],
  filterFields: ["country"],
  defaultSort: "-priority name",
  writableFields: ["country", "name", "email", "phone", "user", "priority", "isActive"],
  beforeCreate: clean,
  beforeUpdate: clean,
  onChange: () => configService.invalidate(),
});
