/**
 * Bot config loader: Mongo se wahi `cfg` object banata hai jo n8n "Save Config Cache" node banata tha.
 *   { settings, countries, visaTypes, questions, knowledge, agents }
 * Cache: ConfigCacheSeconds (default 60). Admin koi bhi config edit kare to invalidate() -> foran naya.
 */
const Country = require("../models/Country");
const VisaType = require("../models/VisaType");
const Question = require("../models/Question");
const Knowledge = require("../models/Knowledge");
const Agent = require("../models/Agent");
const settingService = require("./setting.service");

let cached = null;
let cachedAt = 0;
let loading = null;

const invalidate = () => { cached = null; cachedAt = 0; };

const build = async () => {
  const [settings, countries, visaTypes, questions, knowledge, agents] = await Promise.all([
    settingService.getMap(),
    Country.find().lean(),
    VisaType.find({ isActive: true }).lean(),
    Question.find().lean(),
    Knowledge.find({ isActive: true }).lean(),
    Agent.find({ isActive: true }).sort({ priority: -1, createdAt: 1 }).lean(),
  ]);

  // NOTE: shapes bilkul n8n wale (engine steps inhi par chalte hain)
  return {
    settings: Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, String(v ?? "")])),
    countries: countries.map((c) => ({ name: c.name, aliases: c.aliases || [], cities: c.cities || [], active: !!c.isActive, note: c.notes || "" })),
    visaTypes: visaTypes.map((v) => ({ country: v.country || "ALL", name: v.name, aliases: v.aliases || [], action: v.action || "Apply", note: v.customerMessage || "" })),
    questions: questions.map((q) => ({
      country: q.country || "ALL", visaType: q.visaType || "ALL", field: q.field, label: q.label || q.field,
      ask: q.whatToAsk || "", why: q.whyWeAsk || "", type: (q.type || "text").toLowerCase(), options: q.options || "",
      required: !!q.required, askWhen: q.askWhen || "", order: Number(q.order) || 999, active: q.isActive !== false,
    })),
    knowledge: knowledge.map((k) => ({ country: k.country || "ALL", visaType: k.visaType || "ALL", topic: k.topic, info: k.info })),
    agents: agents.map((a) => ({ country: a.country || "ALL", name: a.name, email: a.email, id: String(a._id) })),
  };
};

const getConfig = async () => {
  const ttl = (Number((cached && cached.settings.ConfigCacheSeconds) || 60) || 60) * 1000;
  if (cached && Date.now() - cachedAt < ttl) return cached;
  if (!loading) {
    loading = build()
      .then((cfg) => { cached = cfg; cachedAt = Date.now(); return cfg; })
      .catch((e) => { if (cached) return cached; throw e; }) // DB slow/fail: purani config se kaam chalao
      .finally(() => { loading = null; });
  }
  return loading;
};

module.exports = { getConfig, invalidate, build };
