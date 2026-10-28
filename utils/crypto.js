/**
 * Secrets (CRM key, WhatsApp token, SMTP password, AI key) DB mein encrypted rakhe jate hain.
 * ENCRYPTION_KEY .env mein (kam az kam 32 characters).
 */
const crypto = require("crypto");

const getKey = () => {
  const raw = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!raw) throw new Error("ENCRYPTION_KEY is not defined in .env");
  return crypto.createHash("sha256").update(String(raw)).digest();
};

const encrypt = (plain) => {
  if (plain === undefined || plain === null || plain === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
};

const decrypt = (payload) => {
  if (!payload || typeof payload !== "string" || !payload.startsWith("v1:")) return payload || "";
  const [, iv, tag, data] = payload.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
};

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

const mask = (s) => {
  const v = String(s || "");
  if (!v) return "";
  return v.length <= 8 ? "••••" : `${v.slice(0, 4)}••••${v.slice(-4)}`;
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = { encrypt, decrypt, sha256, randomToken, mask, safeEqual };
