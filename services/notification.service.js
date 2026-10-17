const Notification = require("../models/Notification");
const { ACL_MODULES, ACL_PERMISSIONS } = require("../utils/aclConstants");
const { hasPermission } = require("../middlewares/acl");
const Role = require("../models/Role");

/**
 * notify(): system notification banata hai. dedupeKey se ek hi event dobara nahi banta
 * (e.g. "AI daily limit" din mein sirf ek dafa). emailTo diya ho to email bhi.
 */
exports.notify = async ({ type, level = "info", title, message = "", meta = {}, dedupeKey, module = null, emailTo = [] }) => {
  try {
    const doc = await Notification.create({ type, level, title, message, meta, dedupeKey, module });
    const to = (Array.isArray(emailTo) ? emailTo : [emailTo]).filter(Boolean);
    if (to.length) {
      const emailProvider = require("./integrations/email.provider");
      emailProvider
        .send({ to: to.join(","), subject: `[${level.toUpperCase()}] ${title}`, html: `<p>${message}</p><pre>${JSON.stringify(meta, null, 2)}</pre>` })
        .catch((e) => console.error("Notify email failed:", e.message));
    }
    return doc;
  } catch (e) {
    if (e.code === 11000) return null; // pehle hi ban chuki
    console.error("Notification error:", e.message);
    return null;
  }
};

const visibleModules = async (user) => {
  if (user.isSuperAdmin) return null; // sab
  const role = await Role.findOne({ _id: user.role, isActive: true }).lean();
  return Object.values(ACL_MODULES).filter((m) => hasPermission(user, role, m, ACL_PERMISSIONS.VIEW));
};

exports.list = async (user, { page = 1, limit = 20, unread } = {}) => {
  page = Math.max(1, +page || 1);
  limit = Math.min(100, Math.max(1, +limit || 20));
  const mods = await visibleModules(user);
  const filter = mods ? { $or: [{ module: null }, { module: { $in: mods } }] } : {};
  if (String(unread) === "true" && user.id) filter.readBy = { $ne: user.id };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(filter),
    user.id ? Notification.countDocuments({ ...filter, readBy: { $ne: user.id } }) : 0,
  ]);
  return {
    items: items.map((n) => ({ ...n, isRead: user.id ? (n.readBy || []).some((x) => String(x) === String(user.id)) : false, readBy: undefined })),
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    unreadCount,
  };
};

exports.markRead = async (user, id) => {
  if (!user.id) return { ok: true };
  const filter = id === "all" ? {} : { _id: id };
  await Notification.updateMany(filter, { $addToSet: { readBy: user.id } });
  return { ok: true };
};
