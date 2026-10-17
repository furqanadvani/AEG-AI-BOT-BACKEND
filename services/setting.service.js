/**
 * Settings: frontend se editable key/value. Engine ko raw string map milta hai (bilkul Excel jaisa),
 * backend code typed getters (bool/number/list) use karta hai.
 */
const Setting = require("../models/Setting");
const DEFAULTS = require("../constants/defaultSettings");
const AppError = require("../utils/AppError");
const { createCrudService } = require("../utils/crudFactory");

const YES = /^(yes|y|true|1|on|active|haan|han|ji)$/i;
const DEFAULT_MAP = Object.fromEntries(DEFAULTS.map((d) => [d.key, d.value]));

let cache = null;
let cacheAt = 0;
const TTL = 15 * 1000;

const invalidate = () => { cache = null; cacheAt = 0; };

const getMap = async () => {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  const rows = await Setting.find({ isActive: true }).select("key value").lean();
  const map = { ...DEFAULT_MAP };
  for (const r of rows) map[r.key] = r.value ?? "";
  cache = map;
  cacheAt = Date.now();
  return map;
};

const getRaw = async (key) => (await getMap())[key];
const getBool = async (key, def = false) => {
  const v = await getRaw(key);
  return v === undefined || v === "" ? def : YES.test(String(v).trim());
};
const getNumber = async (key, def = 0) => {
  const n = Number(await getRaw(key));
  return Number.isFinite(n) ? n : def;
};
const getList = async (key) => String((await getRaw(key)) || "").split(/[|,;\n]/).map((x) => x.trim()).filter(Boolean);

const validateValue = (type, value) => {
  const v = String(value ?? "");
  if (type === "number" && v !== "" && !Number.isFinite(Number(v))) throw AppError.badRequest("Value must be a number");
  if (type === "boolean" && v !== "" && !/^(yes|no|true|false|1|0|on|off)$/i.test(v)) throw AppError.badRequest("Value must be yes/no");
  if (type === "json" && v !== "") { try { JSON.parse(v); } catch { throw AppError.badRequest("Value must be valid JSON"); } }
  return v;
};

const crud = createCrudService(Setting, {
  entity: "Setting",
  searchFields: ["key", "label", "description", "value"],
  filterFields: ["group", "type"],
  defaultSort: "group key",
  writableFields: ["key", "value", "type", "group", "label", "description", "isActive"],
  beforeCreate: async (data) => ({ ...data, value: validateValue(data.type || "string", data.value) }),
  beforeUpdate: async (data, doc) => {
    if (data.value !== undefined) data.value = validateValue(data.type || doc.type, data.value);
    return data;
  },
  onChange: async () => {
    invalidate();
    require("./config.service").invalidate();
  },
});

/** PUT /api/settings  { values: { Key: "Value", ... } }: ek saath kai keys (frontend settings page) */
const bulkSetValues = async (values = {}, user) => {
  if (!values || typeof values !== "object") throw AppError.badRequest("values object is required");
  const results = [];
  for (const [key, value] of Object.entries(values)) {
    const def = DEFAULTS.find((d) => d.key === key);
    const existing = await Setting.findOne({ key });
    const type = existing?.type || def?.type || "string";
    const v = validateValue(type, value);
    if (existing) {
      existing.value = v;
      existing.updatedBy = user?.id || null;
      await existing.save();
    } else {
      await Setting.create({ ...(def || { key, group: "custom" }), key, value: v, type, updatedBy: user?.id || null });
    }
    results.push(key);
  }
  invalidate();
  require("./config.service").invalidate();
  return { updated: results };
};

/** Missing default keys DB mein daal do (purani values nahi chhedta) */
const seedDefaults = async () => {
  let created = 0;
  for (const d of DEFAULTS) {
    const r = await Setting.updateOne({ key: d.key }, { $setOnInsert: { type: "string", ...d } }, { upsert: true });
    if (r.upsertedCount) created++;
  }
  invalidate();
  return { created, total: DEFAULTS.length };
};

module.exports = { ...crud, crud, getMap, getRaw, getBool, getNumber, getList, invalidate, bulkSetValues, seedDefaults, DEFAULTS };
