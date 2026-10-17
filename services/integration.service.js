/**
 * Integrations: AI / CRM / WhatsApp / Email ki config DB mein, frontend se manage.
 * Secrets encrypted save hote hain aur API response mein hamesha masked.
 * DB mein config na ho to .env fallback (taake testing foran ho sake).
 */
const Integration = require("../models/Integration");
const AppError = require("../utils/AppError");
const { encrypt, decrypt, mask } = require("../utils/crypto");
const { INTEGRATION_TYPES } = require("../constants/workflow");

// Har type ke liye default + .env fallback
const ENV_DEFAULTS = {
  ai: () => ({
    provider: process.env.AI_PROVIDER || "groq",
    config: { baseUrl: process.env.AI_BASE_URL || "https://api.groq.com/openai/v1" },
    secrets: { apiKey: process.env.AI_API_KEY || process.env.GROQ_API_KEY || "" },
    isEnabled: !!(process.env.AI_API_KEY || process.env.GROQ_API_KEY),
  }),
  email: () => ({
    provider: "smtp",
    config: {
      host: process.env.SMTP_HOST || "", port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true", user: process.env.SMTP_USER || "", from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
    },
    secrets: { password: process.env.SMTP_PASSWORD || "" },
    isEnabled: !!process.env.SMTP_HOST,
  }),
  whatsapp: () => ({
    provider: "meta_cloud",
    config: { apiVersion: process.env.WA_API_VERSION || "v21.0", phoneNumberId: process.env.WA_PHONE_NUMBER_ID || "" },
    secrets: { accessToken: process.env.WA_ACCESS_TOKEN || "", verifyToken: process.env.WA_VERIFY_TOKEN || "", appSecret: process.env.WA_APP_SECRET || "" },
    isEnabled: process.env.WA_ENABLED === "true",
  }),
  crm: () => ({
    provider: "custom_crm",
    config: {
      baseUrl: process.env.CRM_BASE_URL || "",
      authHeader: "Authorization", authScheme: "Bearer",
      // Endpoints bhi configurable: CRM ki API aate hi sirf yahan path daalne hain
      endpoints: { createLead: "/leads", updateLead: "/leads/:crmId", upsertCustomer: "/customers", ping: "/health" },
      // Field mapping: humare field -> CRM field
      leadFieldMap: {}, customerFieldMap: {},
    },
    secrets: { apiKey: process.env.CRM_API_KEY || "" },
    isEnabled: process.env.CRM_ENABLED === "true",
  }),
};

const assertType = (type) => {
  if (!INTEGRATION_TYPES.includes(type)) throw AppError.badRequest(`Unknown integration type. Allowed: ${INTEGRATION_TYPES.join(", ")}`);
};

const cache = new Map();
const invalidate = (type) => (type ? cache.delete(type) : cache.clear());

/** Internal use: decrypted secrets ke saath (kabhi API response mein mat bhejna) */
const getResolved = async (type) => {
  assertType(type);
  const hit = cache.get(type);
  if (hit && Date.now() - hit.at < 30000) return hit.value;
  const def = ENV_DEFAULTS[type]();
  const doc = await Integration.findOne({ type }).select("+secrets").lean();
  let value;
  if (!doc) value = { type, ...def, source: "env" };
  else {
    const secrets = {};
    for (const [k, v] of Object.entries(doc.secrets || {})) secrets[k] = decrypt(v);
    // DB secret khali ho to env wala use ho
    for (const [k, v] of Object.entries(def.secrets)) if (!secrets[k] && v) secrets[k] = v;
    value = { type, provider: doc.provider, config: { ...def.config, ...(doc.config || {}) }, secrets, isEnabled: !!doc.isEnabled, source: "db" };
  }
  cache.set(type, { at: Date.now(), value });
  return value;
};

const toPublic = (type, doc, resolved) => ({
  type,
  provider: resolved.provider,
  name: doc?.name || type.toUpperCase(),
  config: resolved.config,
  secrets: Object.fromEntries(Object.entries(resolved.secrets || {}).map(([k, v]) => [k, v ? mask(v) : ""])),
  isEnabled: resolved.isEnabled,
  source: resolved.source,
  lastTestAt: doc?.lastTestAt || null,
  lastTestOk: doc?.lastTestOk ?? null,
  lastError: doc?.lastError || null,
  updatedAt: doc?.updatedAt || null,
});

const list = async () => {
  const docs = await Integration.find().lean();
  const out = [];
  for (const type of INTEGRATION_TYPES) {
    out.push(toPublic(type, docs.find((d) => d.type === type), await getResolved(type)));
  }
  return out;
};

const get = async (type) => {
  const doc = await Integration.findOne({ type }).lean();
  return toPublic(type, doc, await getResolved(type));
};

/** PUT /api/integrations/:type  { provider, name, config, secrets, isEnabled }. Masked/khali secret = purana rakho */
const upsert = async (type, payload = {}, user) => {
  assertType(type);
  const doc = (await Integration.findOne({ type }).select("+secrets")) || new Integration({ type, provider: payload.provider || ENV_DEFAULTS[type]().provider });
  if (payload.provider) doc.provider = String(payload.provider).trim();
  if (payload.name !== undefined) doc.name = String(payload.name).trim();
  if (payload.config && typeof payload.config === "object") doc.config = { ...(doc.config || {}), ...payload.config };
  if (payload.secrets && typeof payload.secrets === "object") {
    const secrets = { ...(doc.secrets || {}) };
    for (const [k, v] of Object.entries(payload.secrets)) {
      if (v === null) delete secrets[k];
      else if (typeof v === "string" && v && !v.includes("••••")) secrets[k] = encrypt(v);
    }
    doc.secrets = secrets;
    doc.markModified("secrets");
  }
  if (typeof payload.isEnabled === "boolean") doc.isEnabled = payload.isEnabled;
  doc.updatedBy = user?.id || null;
  doc.markModified("config");
  await doc.save();
  invalidate(type);
  return get(type);
};

const recordTest = async (type, ok, error = null) => {
  await Integration.updateOne({ type }, { $set: { lastTestAt: new Date(), lastTestOk: ok, lastError: error } });
  invalidate(type);
};

const test = async (type) => {
  assertType(type);
  const providers = {
    ai: () => require("./integrations/ai.provider").ping(),
    email: () => require("./integrations/email.provider").verify(),
    whatsapp: () => require("./integrations/whatsapp.provider").ping(),
    crm: () => require("./integrations/crm.provider").ping(),
  };
  try {
    const result = await providers[type]();
    await recordTest(type, true);
    return { ok: true, result };
  } catch (e) {
    await recordTest(type, false, e.message);
    return { ok: false, error: e.message };
  }
};

module.exports = { getResolved, list, get, upsert, test, invalidate, recordTest };
