const Role = require("../models/Role");

const {
  isPermissionSubsetOrEqual,
  normalizePermissions,
  // FIX: pehle yeh Role ko `name: user.role` se dhoondta tha, jabke user.role ObjectId hai
  getLoggedInRole,
} = require("../utils/permissions");

exports.createRole = async (user, payload) => {
  const { name, description } = payload;
  const permissions = normalizePermissions(payload.permissions || []);

  if (!name || !description) {
    const error = new Error(
      "Role name and description are required"
    );
    error.statusCode = 400;
    throw error;
  }

  const existingRole = await Role.findOne({
    name: name.trim(),
  });

  if (existingRole) {
    const error = new Error("Role already exists");
    error.statusCode = 409;
    throw error;
  }

  if (name.trim().toUpperCase() === "SUPER_ADMIN") {
    const error = new Error(
      "SUPER_ADMIN role cannot be created"
    );
    error.statusCode = 403;
    throw error;
  }

  if (!user.isSuperAdmin) {
    const userRole = await getLoggedInRole(user);

    const allowed = isPermissionSubsetOrEqual(
      permissions,
      userRole.permissions
    );

    if (!allowed) {
      const error = new Error(
        "You cannot create a role with higher permissions than your own role"
      );
      error.statusCode = 403;
      throw error;
    }
  }

  return Role.create({
    name: name.trim(),
    description: description.trim(),
    permissions,
    isActive: true,
  });
};

exports.getRoles = async (user) => {
  const roles = await Role.find({
    name: {
      $ne: "SUPER_ADMIN",
    },
  }).lean();

  if (user.isSuperAdmin) {
    return roles;
  }

  const userRole = await getLoggedInRole(user);

  return roles.filter((role) =>
    isPermissionSubsetOrEqual(
      role.permissions,
      userRole.permissions
    )
  );
};

exports.getRoleById = async (user, roleId) => {
  const role = await Role.findOne({
    _id: roleId,
    name: {
      $ne: "SUPER_ADMIN",
    },
  }).lean();

  if (!role) {
    const error = new Error("Role not found");
    error.statusCode = 404;
    throw error;
  }

  if (user.isSuperAdmin) {
    return role;
  }

  const userRole = await getLoggedInRole(user);

  const allowed = isPermissionSubsetOrEqual(
    role.permissions,
    userRole.permissions
  );

  if (!allowed) {
    const error = new Error(
      "You do not have access to this role"
    );
    error.statusCode = 403;
    throw error;
  }

  return role;
};

exports.updateRole = async (user, roleId, payload) => {
  const role = await Role.findOne({
    _id: roleId,
    name: {
      $ne: "SUPER_ADMIN",
    },
  });

  if (!role) {
    const error = new Error("Role not found");
    error.statusCode = 404;
    throw error;
  }

  if (!user.isSuperAdmin) {
    const userRole = await getLoggedInRole(user);

    const allowed = isPermissionSubsetOrEqual(
      role.permissions,
      userRole.permissions
    );

    if (!allowed) {
      const error = new Error(
        "You cannot update this role"
      );
      error.statusCode = 403;
      throw error;
    }
  }

  const { name, description } = payload;
  let { permissions } = payload;

  if (name !== undefined) {
    if (name.trim().toUpperCase() === "SUPER_ADMIN") {
      const error = new Error(
        "SUPER_ADMIN role cannot be used"
      );
      error.statusCode = 403;
      throw error;
    }

    const duplicate = await Role.findOne({
      name: name.trim(),
      _id: {
        $ne: roleId,
      },
    });

    if (duplicate) {
      const error = new Error(
        "Another role with same name exists"
      );
      error.statusCode = 409;
      throw error;
    }

    role.name = name.trim();
  }

  if (description !== undefined) {
    role.description = description.trim();
  }

  if (permissions !== undefined) {
    permissions = normalizePermissions(permissions);
    if (!user.isSuperAdmin) {
      const userRole = await getLoggedInRole(user);

      const allowed = isPermissionSubsetOrEqual(
        permissions,
        userRole.permissions
      );

      if (!allowed) {
        const error = new Error(
          "You cannot assign permissions higher than your own role"
        );
        error.statusCode = 403;
        throw error;
      }
    }

    role.permissions = permissions;
  }

  await role.save();

  return role;
};

exports.updateRoleStatus = async (
  user,
  roleId,
  isActive
) => {
  const role = await Role.findOne({
    _id: roleId,
    name: {
      $ne: "SUPER_ADMIN",
    },
  });

  if (!role) {
    const error = new Error("Role not found");
    error.statusCode = 404;
    throw error;
  }

  if (!user.isSuperAdmin) {
    const userRole = await getLoggedInRole(user);

    const allowed = isPermissionSubsetOrEqual(
      role.permissions,
      userRole.permissions
    );

    if (!allowed) {
      const error = new Error(
        "You cannot change this role status"
      );
      error.statusCode = 403;
      throw error;
    }
  }

  if (typeof isActive !== "boolean") {
    const error = new Error("isActive must be a boolean");
    error.statusCode = 400;
    throw error;
  }

  role.isActive = isActive;

  await role.save();

  return role;
};
/** Frontend role editor: saare modules + permissions */
exports.getModules = () => {
  const { ACL_MODULES, ACL_PERMISSIONS, ACL_MODULE_LABELS } = require("../utils/aclConstants");
  return {
    modules: Object.values(ACL_MODULES).map((key) => ({ key, label: ACL_MODULE_LABELS[key] || key })),
    permissions: Object.values(ACL_PERMISSIONS),
  };
};
