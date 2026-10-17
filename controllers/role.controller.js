const Role = require("../models/Role");
const roleService = require("../services/role.service");
const { isPermissionSubsetOrEqual, normalizePermissions } = require("../utils/permissions");

/** Logged-in user ka role (_id se: req.user.role ObjectId hai, naam nahi) */
const getLoggedInRole = (user) => Role.findOne({ _id: user.role, isActive: true }).lean();

/**
 * Reference jaisa: create + update ek hi function.
 * Body: { roleId?, name, description, permissions, isActive? }
 */
exports.saveRole = async (req, res, next) => {
  try {
    const { roleId, name, description, isActive } = req.body || {};
    const permissions = req.body?.permissions !== undefined ? normalizePermissions(req.body.permissions) : undefined;
    const trimmedName = typeof name === "string" ? name.trim() : name;

    if (trimmedName && trimmedName.toUpperCase() === "SUPER_ADMIN") {
      return res.status(403).json({ error: true, message: "SUPER_ADMIN role cannot be used" });
    }

    // Super admin ke ilawa koi apne se zyada permission nahi de sakta
    if (permissions && !req.user.isSuperAdmin) {
      const userRole = await getLoggedInRole(req.user);
      if (!userRole) {
        return res.status(403).json({ error: true, message: "User role not found" });
      }
      if (!isPermissionSubsetOrEqual(permissions, userRole.permissions)) {
        return res.status(403).json({ error: true, message: "You cannot assign permissions higher than your own role" });
      }
    }

    if (roleId) {
      const existingRole = await Role.findOne({ _id: roleId, name: { $ne: "SUPER_ADMIN" } });
      if (!existingRole) {
        return res.status(404).json({ error: true, message: "Role not found" });
      }

      if (!req.user.isSuperAdmin && String(req.user.role) === String(roleId)) {
        return res.status(403).json({ error: true, message: "You cannot change your own role" });
      }

      if (trimmedName) {
        const duplicateRole = await Role.findOne({ name: trimmedName, _id: { $ne: roleId } });
        if (duplicateRole) {
          return res.status(409).json({ error: true, message: "Another role with same name exists" });
        }
      }

      if (trimmedName) existingRole.name = trimmedName;
      if (description) existingRole.description = description.trim();
      if (permissions) existingRole.permissions = permissions;
      if (typeof isActive === "boolean") existingRole.isActive = isActive;

      await existingRole.save();

      return res.status(200).json({
        error: false,
        message: "Role updated successfully",
        data: existingRole,
      });
    }

    if (!trimmedName || !description) {
      return res.status(400).json({ error: true, message: "Role name and description are required" });
    }

    const roleExists = await Role.findOne({ name: trimmedName });
    if (roleExists) {
      return res.status(409).json({ error: true, message: "Role already exists" });
    }

    const newRole = await Role.create({
      name: trimmedName,
      description: description.trim(),
      permissions: permissions || [],
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    return res.status(201).json({
      error: false,
      message: "Role created successfully",
      data: newRole,
    });
  } catch (error) {
    next(error);
  }
};

exports.createRole = async (req, res, next) => {
  try {
    const role = await roleService.createRole(req.user, req.body);

    return res.status(201).json({
      error: false,
      message: "Role created successfully",
      data: role,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reference jaisa:
 *  - SUPER_ADMIN role kabhi nahi, sirf active roles
 *  - super admin: saare
 *  - baqi: sirf apne role ke andar wali permissions ke roles, aur apna role nahi
 * ?includeInactive=true: disabled roles bhi (Roles page par dobara enable karne ke liye)
 */
exports.getRoles = async (req, res, next) => {
  try {
    const loggedUser = req.user;

    const filter = { name: { $ne: "SUPER_ADMIN" } };
    if (String(req.query.includeInactive) !== "true") filter.isActive = true;

    const roles = await Role.find(filter).sort({ createdAt: -1 }).lean();

    if (loggedUser?.isSuperAdmin === true) {
      return res.status(200).json({ error: false, data: roles });
    }

    const userRole = await getLoggedInRole(loggedUser);

    if (!userRole) {
      return res.status(403).json({ error: true, message: "User role not found" });
    }

    const allowedRoles = roles.filter((role) => isPermissionSubsetOrEqual(role.permissions, userRole.permissions));

    const filteredRoles = allowedRoles.filter((r) => String(r._id) !== String(userRole._id));

    return res.status(200).json({
      error: false,
      data: filteredRoles,
    });
  } catch (error) {
    next(error);
  }
};

exports.getRoleById = async (req, res, next) => {
  try {
    const role = await roleService.getRoleById(req.user, req.params.id);

    return res.status(200).json({
      error: false,
      data: role,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const role = await roleService.updateRole(req.user, req.params.id, req.body);

    return res.status(200).json({
      error: false,
      message: "Role updated successfully",
      data: role,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateRoleStatus = async (req, res, next) => {
  try {
    const role = await roleService.updateRoleStatus(req.user, req.params.id, req.body.isActive);

    return res.status(200).json({
      error: false,
      message: `Role ${role.isActive ? "activated" : "disabled"} successfully`,
      data: role,
    });
  } catch (error) {
    next(error);
  }
};

exports.getModules = async (req, res, next) => {
  try {
    return res.status(200).json({
      error: false,
      data: roleService.getModules(),
    });
  } catch (error) {
    next(error);
  }
};