/**
 * Authentication: do secure channels
 *  1) Members (frontend)       -> Authorization: Bearer <JWT>
 *  2) Machines (n8n, CRM, AI)  -> x-api-key: <key>   (scopes = ACL permissions, API Keys module se manage)
 * Dono ke baad roleAccessMiddleware wahi ACL check karta hai.
 */
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const apiKeyService = require("../services/apiKey.service");

const deny = (res, status, message) => res.status(status).json({ error: true, message });

const authMiddleware = async (req, res, next) => {
  try {
    const apiKeyHeader = req.headers["x-api-key"];
    if (apiKeyHeader) {
      const key = await apiKeyService.verify(apiKeyHeader, req.ip);
      if (!key) return deny(res, 401, "Invalid or inactive API key");
      req.apiKey = key;
      req.user = {
        id: null,
        firstName: key.name,
        lastName: "(API key)",
        email: null,
        role: null,
        isSuperAdmin: false,
        isApiKey: true,
        apiKeyId: key._id,
      };
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return deny(res, 401, "Authentication token is required");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return deny(res, 401, "Authentication token is required");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId)
      .select("_id firstName lastName email role isSuperAdmin isActive passwordChangedAt")
      .lean();

    if (!user) {
      return deny(res, 401, "User not found");
    }

    if (!user.isActive) {
      return deny(res, 403, "Your account is disabled");
    }

    // Password badla to purane tokens khatam
    if (user.passwordChangedAt && decoded.iat * 1000 < new Date(user.passwordChangedAt).getTime() - 1000) {
      return deny(res, 401, "Session expired, please login again");
    }

    req.user = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return deny(res, 401, "Authentication token has expired");
    }

    if (error.name === "JsonWebTokenError") {
      return deny(res, 401, "Invalid authentication token");
    }

    next(error);
  }
};

module.exports = authMiddleware;
