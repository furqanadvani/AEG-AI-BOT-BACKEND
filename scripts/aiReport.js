/**
 * AI health report: ChatLog se dekhna ke bot kitni dafa fail hua, kyun, aur kitne tokens kha raha hai.
 *   npm run ai:report            (pichle 7 din)
 *   npm run ai:report -- 30      (pichle 30 din)
 * Sirf PARHTA hai, kuch likhta / badalta nahi.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const { applyDnsServers } = require("../config/db.config");
const ChatLog = require("../models/ChatLog");

const days = Number(process.argv[2]) || 7;

(async () => {
  applyDnsServers(); // .env mein DNS_SERVERS ho to (querySrv ENOTFOUND ka hal)
  await mongoose.connect(process.env.MONGO_DB_URL, { serverSelectionTimeoutMS: 15000 });
  const since = new Date(Date.now() - days * 86400000);
  const match = { createdAt: { $gte: since } };

  const total = await ChatLog.countDocuments(match);
  if (!total) { console.log(`Pichle ${days} din mein koi log nahi mila.`); return process.exit(0); }

  const group = async (field) => (await ChatLog.aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }, { $sort: { n: -1 } }]))
    .map((r) => `   ${String(r._id || "(khali)").padEnd(18)} ${String(r.n).padStart(6)}  (${((r.n / total) * 100).toFixed(1)}%)`).join("\n");

  const [avg] = await ChatLog.aggregate([{ $match: match }, { $group: {
    _id: null, tokens: { $avg: "$totalTokens" }, ai1In: { $avg: "$ai1In" }, ai2In: { $avg: "$ai2In" }, ai1Out: { $avg: "$ai1Out" }, ai2Out: { $avg: "$ai2Out" },
    latency: { $avg: "$latencyMs" }, maxLatency: { $max: "$latencyMs" }, sumTokens: { $sum: "$totalTokens" } } }]);

  // Ek minute mein sab se zyada tokens (rate limit ka andaza)
  const perMin = await ChatLog.aggregate([{ $match: match },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d %H:%M", date: "$createdAt" } }, t: { $sum: "$totalTokens" }, n: { $sum: 1 } } },
    { $sort: { t: -1 } }, { $limit: 5 }]);

  const failed = await ChatLog.find({ ...match, replyAI: "fallback" }).sort({ createdAt: -1 }).limit(10).lean();

  console.log(`\n===== AI report: pichle ${days} din, ${total} messages =====\n`);
  console.log("Reply kis tarah bana (ok = AI, template = code, fallback = AI FAIL, limited = limit):\n" + await group("replyAI"));
  console.log("\nAI fail ki wajah (aiError, naye logs mein):\n" + await group("aiError"));
  console.log("\nSkipReason (ai1_failed = Understand fail):\n" + await group("skipReason"));
  console.log(`\nAverage tokens / message : ${Math.round(avg.tokens)}  (AI1 in ${Math.round(avg.ai1In)} / out ${Math.round(avg.ai1Out)}, AI2 in ${Math.round(avg.ai2In)} / out ${Math.round(avg.ai2Out)})`);
  console.log(`Total tokens             : ${avg.sumTokens}`);
  console.log(`Latency avg / max        : ${Math.round(avg.latency)} ms / ${avg.maxLatency} ms`);
  console.log("\nSab se bhaari minutes (provider per-minute limit se compare karein):");
  for (const m of perMin) console.log(`   ${m._id}  ${m.t} tokens, ${m.n} messages`);
  if (failed.length) {
    console.log("\nAakhri fail hue messages:");
    for (const f of failed) console.log(`   ${f.createdAt.toISOString()}  [${f.aiError || "?"}]  "${String(f.message || "").slice(0, 60)}"`);
  }
  console.log("");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
