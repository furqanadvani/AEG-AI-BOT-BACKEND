const rateLimit = require("express-rate-limit");

const json = (message) => ({ error: true, message });

// Login brute-force se bachao
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT) || 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many login attempts, please try again later"),
});

// Chat / webhook: per-IP limit (session-level flood control engine ke andar bhi hai)
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.CHAT_RATE_LIMIT) || 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many requests, please slow down"),
});

module.exports = { loginLimiter, chatLimiter };
