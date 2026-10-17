/** Workflow engine end-to-end (in-memory repo + fake AI). npm test */
const test = require("node:test");
const assert = require("node:assert");
const { handleMessage } = require("../services/workflow.service");
const { makeDeps, createFakeAi } = require("./helpers");

const chat = async (deps, sessionId, texts) => {
  let last;
  for (const text of texts) last = await handleMessage({ sessionId, text }, { deps, awaitBackground: true, debug: true });
  return last;
};

const APPLY = ["hi", "I want a dubai tourist visa", "2", "Furqan Ahmed", "0300 1234567", "yes", "confirm"];

test("welcome message comes from template (no AI reply)", async () => {
  const deps = makeDeps();
  const r = await chat(deps, "w1", ["hi"]);
  assert.equal(r.next, "welcome");
  assert.match(r.reply, /Ayesha/);
  assert.equal(r.debug.replyAI, "template");
});

test("full application creates lead + ONE customer profile", async () => {
  const deps = makeDeps();
  const r = await chat(deps, "a1", APPLY);
  assert.equal(r.next, "lead_created");
  assert.ok(r.leadId && r.leadId.startsWith("AEG-"));
  const { leads, customers } = deps.repo.db;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].Country, "UAE");
  assert.equal(leads[0].VisaType, "Tourist");
  assert.equal(leads[0].Travellers, "2");
  assert.equal(leads[0].WhatsApp, "+923001234567");
  assert.equal(leads[0].AssignedAgent, "Ali"); // UAE agent
  assert.equal(Object.keys(customers).length, 1);
  assert.equal(leads[0].customer, customers["+923001234567"]._id);
});

test("same customer applying again for same visa -> duplicate, no new lead/customer", async () => {
  const deps = makeDeps();
  await chat(deps, "d1", APPLY);
  const r = await chat(deps, "d2", ["I want a dubai tourist visa", "3", "Furqan Ahmed", "03001234567", "yes", "confirm"]);
  assert.equal(r.next, "duplicate");
  assert.equal(deps.repo.db.leads.length, 1);
  assert.equal(Object.keys(deps.repo.db.customers).length, 1);
});

test("status check by reference + whatsapp", async () => {
  const deps = makeDeps();
  await chat(deps, "s1", APPLY);
  const ref = deps.repo.db.leads[0].LeadID;
  const r = await chat(deps, "s2", [`check status of ${ref.toLowerCase()}`, "03001234567"]);
  assert.equal(r.next, "status_result");
  assert.equal(r.debug.sideEffect, "status");
});

test("blocked country (Active = No) is refused", async () => {
  const deps = makeDeps();
  const r = await chat(deps, "b1", ["I want a USA tourist visa"]);
  assert.equal(r.next, "blocked_country");
  assert.equal(deps.repo.db.leads.length, 0);
});

test("AI limit reached -> workflow continues in normal (rule-based) mode and still creates lead", async () => {
  const deps = makeDeps({ ai: createFakeAi({ limited: true }) });
  const texts = ["visa chahiye", "UAE", "Tourist", "2", "Furqan Ahmed", "03001234567", "haan", "confirm"];
  let r;
  for (const text of texts) {
    r = await handleMessage({ sessionId: "L1", text }, { deps, awaitBackground: true, debug: true });
    assert.equal(r.aiLimited, true);
    assert.doesNotMatch(r.reply, /technical/i, "limit mode should not say technical issue");
  }
  assert.equal(r.next, "lead_created");
  assert.equal(deps.repo.db.leads.length, 1);
  assert.ok(deps.repo.db.logs.every((l) => l.ReplyAI !== "fallback"));
});

test("direct short answers skip AI #1 (token saving)", async () => {
  const deps = makeDeps();
  await chat(deps, "t1", ["I want a dubai tourist visa"]);
  const before = deps.ai.calls.understand;
  const r = await chat(deps, "t1", ["2"]);
  assert.equal(r.debug.skipReason, "direct_answer");
  assert.equal(deps.ai.calls.understand, before);
});

test("session state persists between messages", async () => {
  const deps = makeDeps();
  await chat(deps, "p1", ["I want a dubai tourist visa", "2"]);
  const s = deps.repo.db.sessions.p1;
  assert.equal(s.state.data.country, "UAE");
  assert.equal(s.state.data.travellers, "2");
  assert.ok(s.history.length >= 4);
  assert.ok(s.aiCalls > 0);
});

test("bot disabled setting returns fixed reply without running engine", async () => {
  const deps = makeDeps({ settings: { BotEnabled: "no" } });
  const r = await handleMessage({ sessionId: "x", text: "hello" }, { deps });
  assert.equal(r.botDisabled, true);
  assert.equal(deps.ai.calls.understand, 0);
});

test("n8n chat payload format (chatInput) is accepted", async () => {
  const deps = makeDeps();
  const r = await handleMessage({ sessionId: "n8n", chatInput: "hi" }, { deps });
  assert.equal(r.next, "welcome");
});

test("concurrent messages for same session are processed in order", async () => {
  const deps = makeDeps();
  await Promise.all([
    handleMessage({ sessionId: "c1", text: "I want a dubai tourist visa" }, { deps }),
    handleMessage({ sessionId: "c1", text: "2" }, { deps }),
  ]);
  assert.equal(deps.repo.db.sessions.c1.state.data.travellers, "2");
});

test("full transcript keeps every message (history is capped at 16)", async () => {
  const deps = makeDeps();
  const texts = ["hi", "I want a dubai tourist visa", "2", "Furqan Ahmed", "0300 1234567", "yes", "confirm", "thanks", "ok", "bye"];
  await chat(deps, "tr1", texts);
  const s = deps.repo.db.sessions.tr1;
  assert.equal(s.transcript.length, texts.length * 2);
  assert.ok(s.history.length <= 16);
  assert.equal(s.transcript[0].role, "user");
  assert.equal(s.transcript[1].role, "assistant");
  assert.ok(s.transcript[1].meta.next);
  assert.ok(s.transcript.some((m) => m.meta && m.meta.leadId));
});

test("customer messages during agent takeover are saved to the transcript", async () => {
  const deps = makeDeps();
  await chat(deps, "tk1", ["hi"]);
  deps.repo.db.sessions.tk1.humanTakeover = true;
  const r = await handleMessage({ sessionId: "tk1", text: "Is anyone there?" }, { deps });
  assert.equal(r.reply, null);
  assert.equal(deps.repo.db.sessions.tk1.transcript.slice(-1)[0].text, "Is anyone there?");
});
