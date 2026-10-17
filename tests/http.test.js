/** HTTP layer (bina DB wale checks): health, auth required, invalid API key, 404, bad JSON */
const test = require("node:test");
const assert = require("node:assert");
process.env.JWT_SECRET = process.env.JWT_SECRET || "test";
const mongoose = require("mongoose");
mongoose.set("bufferCommands", false); // DB nahi hai: query foran fail ho, latke nahi
const app = require("../server");

let server, base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const call = async (path, opts = {}) => {
  const r = await fetch(base + path, opts);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

test("GET /health", async () => {
  const r = await call("/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.data.status, "OK");
});

test("protected routes require auth", async () => {
  for (const p of ["/api/leads", "/api/customers", "/api/countries", "/api/settings", "/api/ai/status", "/api/integrations", "/api/api-keys", "/api/currencies", "/api/roles/modules"]) {
    const r = await call(p);
    assert.equal(r.status, 401, p);
    assert.equal(r.body.error, true);
  }
  const chat = await call("/api/chat/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "hi" }) });
  assert.equal(chat.status, 401);
});

test("invalid JWT and malformed API key are rejected", async () => {
  assert.equal((await call("/api/leads", { headers: { Authorization: "Bearer abc.def.ghi" } })).status, 401);
  const r = await call("/api/leads", { headers: { "x-api-key": "not-a-key" } });
  assert.equal(r.status, 401);
  assert.match(r.body.message, /API key/);
});

test("unknown route -> 404 json", async () => {
  const r = await call("/api/nope");
  assert.equal(r.status, 404);
  assert.match(r.body.message, /Route not found/);
});

test("invalid JSON body -> 400", async () => {
  const r = await call("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" });
  assert.equal(r.status, 400);
  assert.equal(r.body.message, "Invalid JSON body");
});

test("whatsapp webhook: wrong verify token -> 403, right token -> challenge", async () => {
  const integrationService = require("../services/integration.service");
  integrationService.getResolved = async () => ({ isEnabled: false, config: {}, secrets: { verifyToken: "secret123" } });
  const ok = await fetch(`${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=secret123&hub.challenge=777`);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "777");
  const r = await fetch(`${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`);
  assert.equal(r.status, 403);
});
