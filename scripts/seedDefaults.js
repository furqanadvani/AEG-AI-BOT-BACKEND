/**
 * Pehli dafa setup: default Settings + starter roles (Manager, Agent, Viewer).
 * Dobara chalane se kuch nahi bigarta (sirf missing cheezen banti hain).
 *   npm run seed
 */
require("dotenv").config();
require("../config/db.config").applyDnsServers();
const mongoose = require("mongoose");
const Role = require("../models/Role");
const settingService = require("../services/setting.service");
const { ACL_MODULES: M } = require("../utils/aclConstants");

const ALL = ["VIEW", "CREATE", "UPDATE", "DELETE", "DISABLE"];
const ROLES = [
  {
    name: "Manager",
    description: "Runs the whole workflow and team (no roles or integrations)",
    permissions: [
      M.DASHBOARD, M.MEMBERS, M.CUSTOMERS, M.SETTINGS, M.COUNTRIES, M.VISA_TYPES, M.QUESTIONS, M.KNOWLEDGE, M.AGENTS,
      M.LEADS, M.QUERIES, M.SESSIONS, M.CHAT_LOGS, M.CHAT, M.AI_CONTROL, M.NOTIFICATIONS,
    ].map((key) => ({ key, access: ALL })),
  },
  {
    name: "Agent",
    description: "Works on leads, queries and customers",
    permissions: [
      { key: M.DASHBOARD, access: ["VIEW"] },
      { key: M.CUSTOMERS, access: ["VIEW", "CREATE", "UPDATE"] },
      { key: M.LEADS, access: ["VIEW", "CREATE", "UPDATE"] },
      { key: M.QUERIES, access: ["VIEW", "UPDATE"] },
      { key: M.SESSIONS, access: ["VIEW", "UPDATE"] },
      { key: M.KNOWLEDGE, access: ["VIEW"] },
      { key: M.CHAT, access: ["CREATE"] },
      { key: M.NOTIFICATIONS, access: ["VIEW"] },
    ],
  },
  {
    name: "Viewer",
    description: "Read-only access",
    permissions: [M.DASHBOARD, M.CUSTOMERS, M.LEADS, M.QUERIES, M.COUNTRIES, M.VISA_TYPES, M.QUESTIONS, M.KNOWLEDGE, M.AGENTS, M.NOTIFICATIONS].map((key) => ({ key, access: ["VIEW"] })),
  },
];

(async () => {
  try {
    if (!process.env.MONGO_DB_URL) throw new Error("MONGO_DB_URL is not defined in .env");
    await mongoose.connect(process.env.MONGO_DB_URL);

    const s = await settingService.seedDefaults();
    console.log(`Settings: ${s.created} created (${s.total} defaults)`);

    for (const r of ROLES) {
      const res = await Role.updateOne({ name: r.name }, { $setOnInsert: { ...r, isActive: true } }, { upsert: true });
      console.log(`Role ${r.name}: ${res.upsertedCount ? "created" : "already exists"}`);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error("Seed failed:", e);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
})();
