const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

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
// V19: website / n8n / WhatsApp bridge saare customers ek hi server IP se bhejte hain. Pehle 120/min per IP
// par 1000 customers ruk jate the ("Too many requests"). Ab: API key wali requests par limit har customer
// session ki, aur member/browser par IP ki.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: (req) => (req.headers["x-api-key"] ? Number(process.env.CHAT_SESSION_RATE_LIMIT) || 30 : Number(process.env.CHAT_RATE_LIMIT) || 120),
  keyGenerator: (req) => {
    const b = req.body || {};
    const sid = String(b.sessionId ?? b.senderId ?? b.from ?? "").trim().slice(0, 120);
    if (req.headers["x-api-key"] && sid) return `s:${sid}`;
    return `ip:${ipKeyGenerator(req.ip || "")}`;
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: json("Too many requests, please slow down"),
});

module.exports = { loginLimiter, chatLimiter };
