/**
 * Excel / Google Sheet (File > Download > .xlsx) -> MongoDB
 *
 *   npm run import:excel -- ./AEG.xlsx                    # sab tabs
 *   npm run import:excel -- ./AEG.xlsx --dry-run          # sirf check, DB mein kuch nahi likhta
 *   npm run import:excel -- ./AEG.xlsx --only=Countries,Questions
 *   npm run import:excel -- ./AEG.xlsx --replace-config   # config tabs ka purana data mita kar naya
 *
 * Upsert hai: dobara chalane se duplicate nahi bante. Leads/Queries Customer profile se link ho jate hain.
 */
require("dotenv").config();
require("../config/db.config").applyDnsServers();
const path = require("path");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");
const { MAPPERS, ORDER } = require("../utils/excelMappers");

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const replaceConfig = args.includes("--replace-config");
const onlyArg = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const only = onlyArg ? onlyArg.split(",").map((x) => x.trim().toLowerCase()) : null;
const CONFIG_TABS = ["Countries", "VisaTypes", "Questions", "Knowledge", "Agents"];

const cellText = (cell) => {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    if (v.hyperlink) return String(v.hyperlink);
  }
  return String(v);
};

const readSheet = (ws) => {
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col] = cellText(cell).trim(); });
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const obj = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => { if (headers[col]) obj[headers[col]] = cellText(cell); });
    if (Object.values(obj).some((v) => String(v).trim())) rows.push(obj);
  });
  return rows;
};

(async () => {
  if (!file) {
    console.log("Usage: npm run import:excel -- <file.xlsx> [--dry-run] [--only=Countries,Questions] [--replace-config]");
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(file));
  const sheets = Object.fromEntries(wb.worksheets.map((w) => [w.name.trim().toLowerCase(), w]));
  console.log("Sheets found:", wb.worksheets.map((w) => w.name).join(", "));

  if (!dryRun) {
    if (!process.env.MONGO_DB_URL) throw new Error("MONGO_DB_URL is not defined in .env");
    await mongoose.connect(process.env.MONGO_DB_URL);
  }
  const customerService = require("../services/customer.service");

  const summary = [];
  for (const tab of ORDER) {
    if (only && !only.includes(tab.toLowerCase())) continue;
    const ws = sheets[tab.toLowerCase()];
    if (!ws) { summary.push({ tab, status: "sheet not found" }); continue; }
    const { model, key, map } = MAPPERS[tab];
    const mapped = readSheet(ws).map(map).filter(Boolean);
    const docs = mapped.filter((d) => !d.__skip);
    for (const d of mapped) if (d.__skip) console.warn(`  ⚠ ${d.__skip}`);

    if (dryRun) { summary.push({ tab, rows: docs.length, sample: docs[0] }); continue; }

    const Model = require(`../models/${model}`);
    if (replaceConfig && CONFIG_TABS.includes(tab)) await Model.deleteMany({});

    let created = 0, updated = 0, failed = 0;
    for (const doc of docs) {
      try {
        // Customer profile link (ek phone = ek customer)
        if ((tab === "Leads" || tab === "Queries") && doc.whatsapp && doc.fullName) {
          const c = await customerService.upsertFromBot({ name: doc.fullName, phone: doc.whatsapp, language: doc.language, channel: "import" });
          if (c) doc.customer = c._id;
        }
        if (tab === "Sessions" && doc.state?.data?.whatsapp && doc.state?.data?.fullName) {
          const c = await customerService.upsertFromBot({ name: doc.state.data.fullName, phone: doc.state.data.whatsapp, language: doc.language, channel: "import" });
          if (c) doc.customer = c._id;
        }
        const where = Object.fromEntries(key.map((k) => [k, doc[k]]));
        const r = await Model.updateOne(where, { $set: doc }, { upsert: true, runValidators: true, timestamps: !doc.createdAt });
        if (r.upsertedCount) created++; else updated++;
      } catch (e) {
        failed++;
        if (failed <= 5) console.error(`  ${tab} row failed:`, e.message);
      }
    }
    summary.push({ tab, rows: docs.length, created, updated, failed });
  }

  // Customer counters dobara ginna
  if (!dryRun && (!only || only.includes("leads") || only.includes("queries"))) {
    const Customer = require("../models/Customer");
    const Lead = require("../models/Lead");
    const Query = require("../models/Query");
    for (const c of await Customer.find().select("_id").lean()) {
      const [leadsCount, queriesCount, last] = await Promise.all([
        Lead.countDocuments({ customer: c._id }), Query.countDocuments({ customer: c._id }),
        Lead.findOne({ customer: c._id }).sort({ createdAt: -1 }).select("createdAt").lean(),
      ]);
      await Customer.updateOne({ _id: c._id }, { $set: { leadsCount, queriesCount, lastLeadAt: last?.createdAt || null } });
    }
  }

  console.table(summary.map(({ sample, ...x }) => x));
  if (dryRun) for (const x of summary) if (x.sample) console.log(`\n${x.tab} sample:`, JSON.stringify(x.sample, null, 1).slice(0, 600));
  if (!dryRun) await mongoose.disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error("Import failed:", e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
