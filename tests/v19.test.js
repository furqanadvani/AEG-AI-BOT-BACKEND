/** V19: smarter screening, name-first, refused-demand leads, no "technical issue", load. npm test */
const test = require("node:test");
const assert = require("node:assert");
const { handleMessage } = require("../services/workflow.service");
const { makeDeps, createMemoryRepo, createFakeAi } = require("./helpers");
const { parseTravellers, validateField } = require("../services/engine/helpers");
const Query = require("../models/Query");

const chat = async (deps, sessionId, texts) => {
  const out = [];
  for (const text of texts) out.push(await handleMessage({ sessionId, text }, { deps, awaitBackground: true, debug: true }));
  return out;
};
const V19 = { AskNameFirst: "yes", CaptureRefusedLeads: "yes", RefusedLeadStatus: "Not processed", SupportPhone: "021-111-234-234" };

test("travellers: everyday answers are understood", () => {
  const cases = { "just me": 1, "I'm travelling alone": 1, "akela": 1, "sirf main": 1, "me": 1, "me and my wife": 2, "hum dono": 2, "main, biwi aur 2 bache": 4, "hum 3 log": 3, "teen": 3, "mere sath 2 dost": 3 };
  for (const [t, n] of Object.entries(cases)) assert.equal(parseTravellers(t)?.count, n, t);
  assert.equal(parseTravellers("family ke sath"), null); // ginti saaf nahi: dobara poochna theek
  const def = { field: "travellers", type: "number", options: "1-20" };
  assert.deepEqual(validateField({ settings: {} }, {}, def, "just me"), { ok: true, value: "1" });
});

test("'just me' is saved as 1 traveller and the bot moves on (no repeat)", async () => {
  const deps = makeDeps();
  const r = await chat(deps, "t1", ["I want a dubai tourist visa", "just me"]);
  const st = deps.repo.db.sessions.t1.state;
  assert.equal(st.data.travellers, "1");
  assert.notEqual(st.lastAsked, "travellers");
  assert.equal(r[1].debug.skipReason, "direct_answer"); // AI call bachi, jawab tez
});

test("name first: welcome asks the name, then the next question uses it", async () => {
  const deps = makeDeps({ settings: V19 });
  const [w, n] = await chat(deps, "n1", ["hi", "Jamal"]);
  assert.equal(w.next, "welcome");
  assert.match(w.reply, /name/i);
  assert.equal(n.debug.skipReason, "direct_answer");
  const st = deps.repo.db.sessions.n1.state;
  assert.equal(st.data.fullName, "Jamal");
  assert.equal(st.lastAsked, "country");
  assert.match(n.reply, /Jamal/); // naam yaad rakh kar baat
});

test("refused visa type -> name + WhatsApp -> 'Not processed' lead + helpline", async () => {
  const deps = makeDeps({ settings: V19 });
  const r = await chat(deps, "r1", ["I want a dubai work visa", "Jamal Khan", "0300 1234567"]);
  assert.equal(r[0].next, "refused_ask");
  assert.equal(r[1].next, "refused_ask");
  assert.equal(r[2].next, "refused_lead_created");
  const leads = deps.repo.db.leads;
  assert.equal(leads.length, 1);
  assert.equal(leads[0].Status, "Not processed");
  assert.equal(leads[0].Country, "UAE");
  assert.equal(leads[0].VisaType, "Work");
  assert.equal(leads[0].WhatsApp, "+923001234567");
  assert.match(r[2].reply, /021-111-234-234/); // helpline
  // Dobara wahi demand: nayi lead nahi
  await chat(deps, "r2", ["I want a dubai work visa", "Jamal Khan", "03001234567"]);
  assert.equal(deps.repo.db.leads.length, 1);
});

test("blocked country -> fixed refusal text + asks name; customer declines politely", async () => {
  const deps = makeDeps({ settings: V19 });
  const r = await chat(deps, "b1", ["I want a USA tourist visa", "no thanks"]);
  assert.equal(r[0].next, "refused_ask");
  assert.match(r[0].reply, /do not provide visa consultation/i);
  assert.equal(r[1].next, "refused_dropped");
  assert.equal(deps.repo.db.leads.length, 0);
});

test("customer switches to a supported visa during refused capture -> normal application", async () => {
  const deps = makeDeps({ settings: V19 });
  const r = await chat(deps, "s1", ["I want a dubai work visa", "ok tourist then"]);
  assert.equal(r[1].debug.sideEffect, "none");
  const st = deps.repo.db.sessions.s1.state;
  assert.equal(st.refused, null);
  assert.equal(st.data.visaType, "Tourist");
});

test("query types the engine sends are valid in Mongo (old cause of 'technical issue')", async () => {
  for (const type of ["VISA_TYPE", "UPDATE_AFTER_SUBMIT", "REFUSED", "LOST", "HUMAN"]) {
    const q = new Query({ queryId: "Q-" + type, type, status: type === "LOST" ? "Lost" : "Open" });
    await assert.doesNotReject(q.validate(), type);
  }
});

test("AI provider down: no 'technical issue' anywhere and lead still created", async () => {
  const ai = { calls: {}, async run() { return { ok: false, limited: false, reason: "provider_error", error: "timeout" }; } };
  const deps = makeDeps({ ai });
  const r = await chat(deps, "f1", ["hi", "I want a dubai tourist visa", "2", "Furqan Ahmed", "0300 1234567", "yes", "confirm"]);
  for (const x of r) assert.doesNotMatch(x.reply, /technical|1 minute|minute baad/i);
  assert.equal(deps.repo.db.leads.length, 1);
});

test("database blip on save: turn is retried, customer still gets a normal reply", async () => {
  const repo = createMemoryRepo();
  const orig = repo.saveSession; let fails = 1;
  repo.saveSession = async (...a) => { if (fails-- > 0) throw new Error("connection reset"); return orig(...a); };
  const deps = makeDeps({ repo });
  const [r] = await chat(deps, "e1", ["I want a dubai tourist visa"]);
  assert.ok(r.reply);
  assert.doesNotMatch(r.reply, /technical/i);
  assert.ok(repo.db.sessions.e1);
});

test("load: 300 customers at the same time all get a lead", async () => {
  const deps = makeDeps({ ai: createFakeAi() });
  const flow = ["I want a dubai tourist visa", "2", "Customer Name", null, "yes", "confirm"];
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 300 }, (_, i) => (async () => {
    const phone = "0300" + String(1000000 + i);
    await chat(deps, `load${i}`, flow.map((x) => x === null ? phone : x));
  })()));
  assert.equal(deps.repo.db.leads.length, 300);
  assert.ok(Date.now() - t0 < 20000, "engine overhead should be small");
});

test("V19.1: real chat replay - name + Dubai in one sentence, 'Karachi se' is departure (AI down)", async () => {
  const ai = { async run() { return { ok: false, limited: false, reason: "provider_error", error: "rate_limit" }; } };
  const deps = makeDeps({ ai, settings: V19 });
  const r = await chat(deps, "rp1", ["Assalam o alaikum", "Mera name furqan haai me dubai jana chahta houn", "Me karachi sy safar karounga", "ghoomne"]);
  const d = deps.repo.db.sessions.rp1.state.data;
  assert.equal(d.fullName, "Furqan");
  assert.equal(d.country, "UAE");
  assert.equal(d.departureCity, "Karachi");
  assert.equal(d.visaType, "Tourist");
  assert.match(r[1].reply, /Furqan/);
  assert.notEqual(r[1].reply, r[2].reply); // wahi jawab dobara nahi
  for (const x of r) assert.doesNotMatch(x.reply, /kis mulk ka safar plan/i);
});

test("V19.2: 'do u talk in english' is a question, never saved as the name", async () => {
  const def = { field: "fullName", type: "name" };
  for (const t of ["do u talk in english", "can you help me", "i want visa", "aap kaise ho"]) assert.equal(validateField({ settings: {} }, {}, def, t).ok, false, t);
  for (const t of ["Ali Raza", "Noor Fatima", "Muhammad Bilal Khan", "Jamal"]) assert.equal(validateField({ settings: {} }, {}, def, t).ok, true, t);
  const deps = makeDeps({ settings: V19 });
  await chat(deps, "lg1", ["hello", "do u talk in english"]);
  assert.equal(deps.repo.db.sessions.lg1.state.data.fullName, undefined);
});

test("V19.2: France (blocked) as the very first message -> demand capture even with no setting saved", async () => {
  const deps = makeDeps(); // CaptureRefusedLeads DB mein na ho tab bhi ON
  const [r] = await chat(deps, "fr1", ["I want a USA visa"]);
  assert.equal(r.next, "refused_ask");
});

test("V19.2: English chat gets English-only examples and a strict language rule", async () => {
  let sys = "";
  const ai = createFakeAi(); const run0 = ai.run;
  ai.run = async (a) => { if (a.purpose === "reply") sys = a.payload.messages[0].content; return run0(a); };
  const deps = makeDeps({ ai, settings: V19 });
  await chat(deps, "en1", ["hello", "Ali", "I want a dubai tourist visa"]);
  assert.match(sys, /never mix languages/);
  assert.match(sys, /Do NOT use any Urdu or Roman Urdu words/);
  assert.doesNotMatch(sys, /kab tak travel karna chahenge|Theek hai, aap akele|Dubai, bohat khoob Jamal/);
});

test("V19.4: blocked country reply instruction asks for the NAME, not 'which other country'", async () => {
  let sys = "";
  const ai = createFakeAi(); const run0 = ai.run;
  ai.run = async (a) => { if (a.purpose === "reply") sys = a.payload.messages[0].content; return run0(a); };
  const deps = makeDeps({ ai, settings: V19 });
  const [r] = await chat(deps, "fr2", ["I want a USA tourist visa"]);
  assert.equal(r.next, "refused_ask");
  const turn = sys.split("THIS TURN, in this order:")[1] || "";
  assert.match(turn, /ask for their Full name/);
  assert.doesNotMatch(turn, /ask which other country they are planning/);
});
