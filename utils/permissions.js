/** Role/API-key permission helpers (pehle role.service aur member.service mein alag alag copy the) */
const Role = require("../models/Role");
const { ACL_MODULES, ACL_PERMISSIONS, ACL_ALL } = require("./aclConstants");

const VALID_MODULES = new Set([...Object.values(ACL_MODULES), ACL_ALL]);
const VALID_ACCESS = new Set([...Object.values(ACL_PERMISSIONS), ACL_ALL]);

const isPermissionSubsetOrEqual = (child = [], parent = []) => {
  if (parent.some((p) => p.key === ACL_ALL && p.access.includes(ACL_ALL))) return true;
  return child.every((childPermission) => {
    const parentPermission = parent.find((permission) => permission.key === childPermission.key);
    if (!parentPermission) return false;
    if (parentPermission.access.includes(ACL_ALL)) return true;
    return childPermission.access.every((access) => parentPermission.access.includes(access));
  });
};

/** Ghalat module/permission names reject + duplicates merge */
const normalizePermissions = (permissions = []) => {
  if (!Array.isArray(permissions)) {
    const e = new Error("permissions must be an array");
    e.statusCode = 400;
    throw e;
  }
  const map = new Map();
  for (const p of permissions) {
    const key = String(p?.key || "").trim().toUpperCase();
    if (!VALID_MODULES.has(key)) {
      const e = new Error(`Invalid permission module: ${p?.key}`);
      e.statusCode = 400;
      throw e;
    }
    const access = (Array.isArray(p.access) ? p.access : []).map((a) => String(a).trim().toUpperCase());
    for (const a of access) {
      if (!VALID_ACCESS.has(a)) {
        const e = new Error(`Invalid access "${a}" for ${key}`);
        e.statusCode = 400;
        throw e;
      }
    }
    map.set(key, [...new Set([...(map.get(key) || []), ...access])]);
  }
  return [...map.entries()].map(([key, access]) => ({ key, access }));
};

const getLoggedInRole = async (user) => {
  if (user?.isSuperAdmin) return null;
  const role = await Role.findOne({ _id: user.role, isActive: true }).lean();
  if (!role) {
    const error = new Error("User role not found");
    error.statusCode = 403;
    throw error;
  }
  return role;
};

module.exports = { isPermissionSubsetOrEqual, normalizePermissions, getLoggedInRole };
