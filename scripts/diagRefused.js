/**
 * V19.3 diagnose: refused (France / USA) par lead kyun nahi ban rahi?
 *   node scripts/diagRefused.js            (default "i want a France visa")
 *   node scripts/diagRefused.js "USA visa chahiye"
 * Aapki asal DB config + asal engine chalata hai (server ki zaroorat nahi). Test session baad mein mita deta hai.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { connectToDatabase } = require("../config/db.config");

(async () => {
  await connectToDatabase();
  const Setting = require("../models/Setting");
  const Country = require("../models/Country");
  const Session = require("../models/Session");
  const config = require("../services/config.service");
  const workflow = require("../services/workflow.service");
  const text = process.argv[2] || "i want a France visa";

  const s = await Setting.findOne({ key: "CaptureRefusedLeads" }).lean();
  console.log("1) DB setting CaptureRefusedLeads:", s ? JSON.stringify({ value: s.value, isActive: s.isActive }) : "(DB mein nahi, default = ON)");
  const blocked = await Country.find({ isActive: false }).select("name aliases cities notes").lean();
  console.log("2) Mana wali countries (Active = No):", blocked.map((c) => `${c.name} [${[...(c.aliases || []), ...(c.cities || [])].join(", ")}]`).join(" | ") || "(koi nahi)");
  const cfg = await config.build();
  console.log("3) Engine ko jati value:", JSON.stringify(cfg.settings.CaptureRefusedLeads), "| AskNameFirst:", JSON.stringify(cfg.settings.AskNameFirst));

  const sid = "diag-" + Date.now();
  const r = await workflow.handleMessage({ sessionId: sid, text }, { channel: "test", debug: true, awaitBackground: true });
  console.log(`4) Engine ka natija for "${text}":`);
  console.log("   next:", r.next, "| captureRefused:", r.debug?.captureRefused, "| sideEffect:", r.debug?.sideEffect);
  console.log("   notes:", JSON.stringify(r.debug?.notes), "| refused state:", JSON.stringify(r.debug?.refused));
  console.log("   reply:", String(r.reply || "").replace(/\s+/g, " ").slice(0, 300));
  // V19.4: sirf "next" nahi, asal jawab bhi check (pehle next sahi tha lekin jawab "kis aur mulk" poochta tha)
  const asksContact = /(name|naam|نام|whatsapp|number)/i.test(String(r.reply || ""));
  console.log(r.next === "refused_ask" && asksContact
    ? "\n=> THEEK: bot mana karke naam / number maang raha hai."
    : "\n=> MASLA: jawab naam / number nahi maang raha. Yeh poora output mujhe bhej dein.");
  await Session.deleteOne({ sessionId: sid });
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error("Diag failed:", e.message); process.exit(1); });
