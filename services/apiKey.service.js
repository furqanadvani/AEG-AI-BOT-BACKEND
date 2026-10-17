/**
 * API keys: n8n / CRM / AI agent / WhatsApp bridge ke liye secure channel.
 * Key = "aeg_" + random. DB mein sirf sha256 hash. Scopes = ACL permissions.
 */
const ApiKey = require("../models/ApiKey");
const AppError = require("../utils/AppError");
const { sha256, randomToken } = require("../utils/crypto");
const { isPermissionSubsetOrEqual, normalizePermissions, getLoggedInRole } = require("../utils/permissions");
const { buildListQuery, paginationMeta } = require("../utils/queryBuilder");
const { assertId } = require("../utils/crudFactory");

const cache = new Map(); // hash -> { at, doc }
const CACHE_MS = 60 * 1000;

const assertCanGrant = async (user, permissions) => {
  if (user.isSuperAdmin) return;
  if (user.isApiKey) throw AppError.forbidden("API keys cannot create API keys");
  const role = await getLoggedInRole(user);
  if (!isPermissionSubsetOrEqual(permissions, role.permissions)) throw AppError.forbidden("You cannot grant permissions higher than your own role");
};

const verify = async (raw, ip) => {
  const key = String(raw || "").trim();
  if (!key.startsWith("aeg_") || key.length < 20) return null;
  const hash = sha256(key);
  let hit = cache.get(hash);
  if (!hit || Date.now() - hit.at > CACHE_MS) {
    const doc = await ApiKey.findOne({ keyHash: hash }).lean();
    hit = { at: Date.now(), doc };
    cache.set(hash, hit);
  }
  const doc = hit.doc;
  if (!doc || !doc.isActive) return null;
  if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) return null;
  if (doc.ipAllowlist?.length && !doc.ipAllowlist.includes(String(ip || "").replace(/^::ffff:/, ""))) return null;
  // Usage update (har request par DB write nahi: 1 minute mein ek)
  if (!doc.lastUsedAt || Date.now() - new Date(doc.lastUsedAt).getTime() > 60000) {
    doc.lastUsedAt = new Date();
    ApiKey.updateOne({ _id: doc._id }, { $set: { lastUsedAt: doc.lastUsedAt, lastUsedIp: ip }, $inc: { usageCount: 1 } }).catch(() => {});
  }
  return doc;
};

const clearCache = () => cache.clear();

const create = async (user, { name, description = "", permissions = [], expiresAt = null, ipAllowlist = [] }) => {
  if (!String(name || "").trim()) throw AppError.badRequest("name is required");
  const perms = normalizePermissions(permissions);
  if (!perms.length) throw AppError.badRequest("At least one permission (scope) is required");
  await assertCanGrant(user, perms);
  const raw = `aeg_${randomToken(30)}`;
  const doc = await ApiKey.create({
    name: String(name).trim(), description, permissions: perms, expiresAt: expiresAt ? new Date(expiresAt) : null,
    ipAllowlist: (ipAllowlist || []).map((x) => String(x).trim()).filter(Boolean), prefix: raw.slice(0, 12), keyHash: sha256(raw), createdBy: user.id || null,
  });
  const out = doc.toObject();
  delete out.keyHash;
  return { ...out, key: raw, warning: "This key is shown only once. Store it somewhere safe." };
};

const list = async (query) => {
  const { filter, sort, page, limit, skip } = buildListQuery(query, { searchFields: ["name", "prefix", "description"] });
  const [items, total] = await Promise.all([ApiKey.find(filter).sort(sort).skip(skip).limit(limit).lean(), ApiKey.countDocuments(filter)]);
  return { items, pagination: paginationMeta(total, page, limit) };
};

const getById = async (id) => {
  assertId(id);
  const k = await ApiKey.findById(id).lean();
  if (!k) throw AppError.notFound("API key not found");
  return k;
};

const update = async (user, id, { name, description, permissions, expiresAt, ipAllowlist }) => {
  assertId(id);
  const k = await ApiKey.findById(id);
  if (!k) throw AppError.notFound("API key not found");
  if (name !== undefined) k.name = String(name).trim();
  if (description !== undefined) k.description = description;
  if (permissions !== undefined) {
    const perms = normalizePermissions(permissions);
    await assertCanGrant(user, perms);
    k.permissions = perms;
  }
  if (expiresAt !== undefined) k.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (ipAllowlist !== undefined) k.ipAllowlist = (ipAllowlist || []).map((x) => String(x).trim()).filter(Boolean);
  await k.save();
  clearCache();
  return getById(id);
};

const setStatus = async (id, isActive) => {
  assertId(id);
  const k = await ApiKey.findById(id);
  if (!k) throw AppError.notFound("API key not found");
  k.isActive = typeof isActive === "boolean" ? isActive : !k.isActive;
  await k.save();
  clearCache();
  return getById(id);
};

/** Nayi key, purani foran band (leak hone par) */
const regenerate = async (user, id) => {
  const k = await getById(id);
  await assertCanGrant(user, k.permissions);
  const raw = `aeg_${randomToken(30)}`;
  await ApiKey.updateOne({ _id: id }, { $set: { keyHash: sha256(raw), prefix: raw.slice(0, 12) } });
  clearCache();
  return { ...(await getById(id)), key: raw, warning: "The previous key no longer works." };
};

const remove = async (id) => {
  assertId(id);
  const k = await ApiKey.findByIdAndDelete(id);
  if (!k) throw AppError.notFound("API key not found");
  clearCache();
  return { _id: id };
};

module.exports = { verify, create, list, getById, update, setStatus, regenerate, remove, clearCache };
