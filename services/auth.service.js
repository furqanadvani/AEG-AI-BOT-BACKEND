const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Role = require("../models/Role");
const { sha256, randomToken } = require("../utils/crypto");

const fail = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

exports.login = async ({ email, password }) => {
  if (!email || !password) {
    const error = new Error(
      "Email and password are required"
    );

    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
  }).select("+password");

  if (!user) {
    const error = new Error(
      "Invalid email or password"
    );

    error.statusCode = 401;
    throw error;
  }

  // User disabled check
  if (!user.isActive) {
    const error = new Error(
      "Your account is disabled"
    );

    error.statusCode = 403;
    throw error;
  }

  let role = null;

  if (!user.isSuperAdmin) {
    role = await Role.findOne({
      _id: user.role,
      isActive: true,
    }).lean();

    if (!role) {
      const error = new Error(
        "Your assigned role is disabled or no longer available"
      );

      error.statusCode = 403;
      throw error;
    }
  }

  const passwordMatched = await bcrypt.compare(
    password,
    user.password
  );

  if (!passwordMatched) {
    const error = new Error(
      "Invalid email or password"
    );

    error.statusCode = 401;
    throw error;
  }

  User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});

  const token = jwt.sign(
    {
      userId: user._id,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    }
  );

  return {
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      role,
    },
  };
};

exports.getProfile = async (userId) => {
  const user = await User.findById(userId)
    .select("-password")
    .populate({
      path: "role",
      select: "name description permissions isActive",
    })
    .lean();

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error("Your account is disabled");
    error.statusCode = 403;
    throw error;
  }

  if (
    !user.isSuperAdmin &&
    (!user.role || !user.role.isActive)
  ) {
    const error = new Error(
      "Your assigned role is disabled or no longer available"
    );
    error.statusCode = 403;
    throw error;
  }

  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    isActive: user.isActive,
    isSuperAdmin: user.isSuperAdmin,
    role: user.isSuperAdmin ? null : user.role,
  };
};
/**
 * Forgot password: token banta hai (DB mein hash), email se link jata hai.
 * Email integration band ho to development mein token response mein aata hai (testing ke liye).
 */
exports.forgotPassword = async ({ email }) => {
  if (!email) throw fail("Email is required", 400);
  const user = await User.findOne({ email: String(email).toLowerCase().trim(), isActive: true });
  // Email exist kare ya na kare, jawab same (user enumeration se bachao)
  if (!user) return {};

  const raw = randomToken(32);
  user.resetPasswordToken = sha256(raw);
  user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();

  const link = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password?token=${raw}`;
  const emailProvider = require("./integrations/email.provider");
  const r = await emailProvider
    .send({ to: user.email, subject: "Password reset", html: `<p>To reset your password, <a href="${link}">click here</a>. This link expires in 30 minutes.</p>` })
    .catch((e) => ({ error: e.message }));

  return process.env.NODE_ENV !== "production" && !r.sent ? { devResetToken: raw } : {};
};

exports.resetPassword = async ({ token, password }) => {
  if (!token || !password) throw fail("Token and password are required", 400);
  if (String(password).length < 8) throw fail("Password must be at least 8 characters", 400);

  const user = await User.findOne({
    resetPasswordToken: sha256(token),
    resetPasswordExpires: { $gt: new Date() },
  }).select("+resetPasswordToken +resetPasswordExpires");

  if (!user) throw fail("Reset token is invalid or has expired", 400);

  user.password = await bcrypt.hash(password, 12);
  user.passwordChangedAt = new Date();
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save();
  return {};
};

exports.changePassword = async (userId, { currentPassword, newPassword }) => {
  if (!userId) throw fail("Only members can change password", 400);
  if (!currentPassword || !newPassword) throw fail("currentPassword and newPassword are required", 400);
  if (String(newPassword).length < 8) throw fail("Password must be at least 8 characters", 400);

  const user = await User.findById(userId).select("+password");
  if (!user) throw fail("User not found", 404);
  if (!(await bcrypt.compare(currentPassword, user.password))) throw fail("Current password is incorrect", 400);

  user.password = await bcrypt.hash(newPassword, 12);
  user.passwordChangedAt = new Date();
  await user.save();
  return {};
};
