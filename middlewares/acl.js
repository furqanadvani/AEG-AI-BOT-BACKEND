const Role = require("../models/Role");
const { ACL_ALL } = require("../utils/aclConstants");

const hasPermission = (user, roleDoc, moduleKey, action) => {
  // Super Admin has complete access
  if (user?.isSuperAdmin) {
    return true;
  }

  // Role not found
  if (!roleDoc || !roleDoc.permissions) {
    return false;
  }

  // Global access
  const hasGlobalAccess = roleDoc.permissions.some(
    (permission) => permission.key === ACL_ALL && permission.access.includes(ACL_ALL)
  );

  if (hasGlobalAccess) {
    return true;
  }

  // Find requested module
  const modulePermission = roleDoc.permissions.find((permission) => permission.key === moduleKey);

  if (!modulePermission) {
    return false;
  }

  // Check requested permission
  return modulePermission.access.includes(action) || modulePermission.access.includes(ACL_ALL);
};

const roleAccessMiddleware = (moduleKey, action) => {
  return async (req, res, next) => {
    try {
      // Authentication middleware should run before ACL
      if (!req.user) {
        return res.status(401).json({
          error: true,
          message: "Unauthorized",
        });
      }

      // Super Admin bypass
      if (req.user.isSuperAdmin) {
        return next();
      }

      // API key: uske apne scopes (same permission format) check hote hain
      if (req.apiKey) {
        if (!hasPermission(req.user, { permissions: req.apiKey.permissions }, moduleKey, action)) {
          return res.status(403).json({
            error: true,
            message: `API key does not have ${moduleKey}:${action} scope`,
          });
        }
        return next();
      }

      // User role is stored as ObjectId
      const roleDoc = await Role.findOne({
        _id: req.user.role,
        isActive: true,
      }).lean();

      if (!roleDoc) {
        return res.status(403).json({
          error: true,
          message: "User role not found or inactive",
        });
      }

      const allowed = hasPermission(req.user, roleDoc, moduleKey, action);

      if (!allowed) {
        return res.status(403).json({
          error: true,
          message: "You do not have permission to perform this action",
        });
      }

      // Make role available to controllers/services if needed
      req.role = roleDoc;

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  hasPermission,
  roleAccessMiddleware,
};
