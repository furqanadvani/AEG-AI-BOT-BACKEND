const bcrypt = require("bcrypt");

const User = require("../models/User");
const Role = require("../models/Role");

const sanitizeUser = (user) => {
  const data = user.toObject ? user.toObject() : { ...user };

  delete data.password;
  delete data.resetPasswordToken;
  delete data.resetPasswordExpires;

  return data;
};

const getRole = async (roleId) => {
  const role = await Role.findOne({
    _id: roleId,
    name: { $ne: "SUPER_ADMIN" },
    isActive: true,
  }).lean();

  if (!role) {
    const error = new Error("Role not found or inactive");
    error.statusCode = 400;
    throw error;
  }

  return role;
};

const { isPermissionSubsetOrEqual, getLoggedInRole } = require("../utils/permissions");

exports.addMember = async (loggedUser, payload) => {
  const {
    firstName,
    lastName,
    email,
    password,
    role,
  } = payload;

  if (
    !firstName ||
    !lastName ||
    !email ||
    !password ||
    !role
  ) {
    const error = new Error(
      "First name, last name, email, password and role are required"
    );

    error.statusCode = 400;
    throw error;
  }

  if (String(password).length < 8) {
    const error = new Error("Password must be at least 8 characters");
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    const error = new Error("Email already exists");
    error.statusCode = 409;
    throw error;
  }

  const targetRole = await getRole(role);

  // Normal users can only assign roles
  // whose permissions are within their own permissions.
  if (!loggedUser.isSuperAdmin) {
    const loggedRole = await getLoggedInRole(loggedUser);

    const allowed = isPermissionSubsetOrEqual(
      targetRole.permissions,
      loggedRole.permissions
    );

    if (!allowed) {
      const error = new Error(
        "You cannot assign a role with higher permissions than your own role"
      );

      error.statusCode = 403;
      throw error;
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: normalizedEmail,
    password: passwordHash,
    role: targetRole._id,
    isSuperAdmin: false,
    isActive: true,
  });

  return sanitizeUser(user);
};

exports.getMembers = async (query = {}) => {
  const filter = { isSuperAdmin: { $ne: true } };
  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 60), "i");
    filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
  }
  if (query.role) filter.role = query.role;
  if (query.isActive !== undefined && query.isActive !== "") filter.isActive = query.isActive === "true";

  const users = await User.find(filter)
    .populate({
      path: "role",
      select: "name description permissions isActive",
    })
    .select(
      "_id firstName lastName email role isActive lastLoginAt createdAt updatedAt"
    )
    .sort({ createdAt: -1 })
    .lean();

  return users;
};

exports.getMemberById = async (memberId) => {
  const user = await User.findOne({
    _id: memberId,
    isSuperAdmin: { $ne: true },
  })
    .populate({
      path: "role",
      select: "name description permissions isActive",
    })
    .select(
      "_id firstName lastName email role isActive createdAt updatedAt"
    )
    .lean();

  if (!user) {
    const error = new Error("Member not found");
    error.statusCode = 404;
    throw error;
  }

  return user;
};

exports.updateMember = async (
  loggedUser,
  memberId,
  payload
) => {
  const member = await User.findOne({
    _id: memberId,
    isSuperAdmin: { $ne: true },
  });

  if (!member) {
    const error = new Error("Member not found");
    error.statusCode = 404;
    throw error;
  }

  const {
    firstName,
    lastName,
    email,
    password,
    role,
  } = payload;

  if (email !== undefined) {
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: memberId },
    });

    if (existingUser) {
      const error = new Error("Email already exists");
      error.statusCode = 409;
      throw error;
    }

    member.email = normalizedEmail;
  }

  if (firstName !== undefined) {
    member.firstName = firstName.trim();
  }

  if (lastName !== undefined) {
    member.lastName = lastName.trim();
  }

  if (password !== undefined && password !== "") {
    if (String(password).length < 8) {
      const error = new Error("Password must be at least 8 characters");
      error.statusCode = 400;
      throw error;
    }
    member.password = await bcrypt.hash(password, 12);
    member.passwordChangedAt = new Date();
  }

  // Role can also be updated
  if (role !== undefined) {
    const targetRole = await getRole(role);

    if (!loggedUser.isSuperAdmin) {
      const loggedRole = await getLoggedInRole(loggedUser);

      const allowed = isPermissionSubsetOrEqual(
        targetRole.permissions,
        loggedRole.permissions
      );

      if (!allowed) {
        const error = new Error(
          "You cannot assign a role with higher permissions than your own role"
        );

        error.statusCode = 403;
        throw error;
      }
    }

    member.role = targetRole._id;
  }

  await member.save();

  return sanitizeUser(member);
};

exports.updateMemberStatus = async (
  memberId,
  isActive
) => {
  if (typeof isActive !== "boolean") {
    const error = new Error("isActive must be a boolean");
    error.statusCode = 400;
    throw error;
  }

  const member = await User.findOne({
    _id: memberId,
    isSuperAdmin: { $ne: true },
  });

  if (!member) {
    const error = new Error("Member not found");
    error.statusCode = 404;
    throw error;
  }

  member.isActive = isActive;

  await member.save();

  return sanitizeUser(member);
};