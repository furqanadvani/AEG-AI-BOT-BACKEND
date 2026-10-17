const Lead = require("../models/Lead");
const Query = require("../models/Query");
const Session = require("../models/Session");
const Customer = require("../models/Customer");
const ChatLog = require("../models/ChatLog");
const aiService = require("./ai.service");

const TZ = "Asia/Karachi";
const RANGES = { today: 0, "7d": 7, "30d": 30, "90d": 90, all: null };

const startOfPkDay = (daysAgo = 0) => {
  const d = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: TZ })}T00:00:00+05:00`);
  d.setDate(d.getDate() - daysAgo);
  return d;
};

const rangeStart = (range) => {
  if (!(range in RANGES) || RANGES[range] === null) return null;
  return startOfPkDay(Math.max(0, RANGES[range] - 1));
};

/** { key: "2026-10-14", count } list, khali din/mahine 0 ke saath */
const series = async (Model, field, { unit, count, match = {} }) => {
  const fmt = unit === "month" ? "%Y-%m" : "%Y-%m-%d";
  const from = unit === "month" ? new Date(startOfPkDay(0).getFullYear(), startOfPkDay(0).getMonth() - (count - 1), 1) : startOfPkDay(count - 1);
  const rows = await Model.aggregate([
    { $match: { ...match, [field]: { $gte: from } } },
    { $group: { _id: { $dateToString: { format: fmt, date: `$${field}`, timezone: TZ } }, count: { $sum: 1 } } },
  ]);
  const map = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const keys = [];
  for (let i = count - 1; i >= 0; i--) {
    if (unit === "month") {
      const d = new Date(startOfPkDay(0).getFullYear(), startOfPkDay(0).getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    } else {
      keys.push(startOfPkDay(i).toLocaleDateString("en-CA", { timeZone: TZ }));
    }
  }
  return keys.map((key) => ({ key, count: map[key] || 0 }));
};

const topBy = async (match, field, limit = 5) =>
  (await Lead.aggregate([
    { $match: { ...match, [field]: { $nin: [null, ""] } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 }, approved: { $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] } } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ])).map((r) => ({ name: r._id, count: r.count, approved: r.approved }));

/**
 * range: today | 7d | 30d | 90d | all
 * Purane fields (leads.today, queries.open ...) bhi rehte hain taake purana frontend na toote.
 */
exports.stats = async ({ range = "30d" } = {}) => {
  if (!(range in RANGES)) range = "30d";
  const from = rangeStart(range);
  const inRange = from ? { createdAt: { $gte: from } } : {};
  const today = startOfPkDay(0);

  const [
    leadsInRange, leadsToday, leadsByStatus, openQueries, queriesByType, sessionsInRange, sessionsToday,
    customersTotal, newCustomers, messagesInRange, messagesToday, leadsDaily, sessionsDaily, messagesDaily,
    leadsMonthly, sessionsMonthly, topCountries, topVisaTypes, topAgents, ai,
  ] = await Promise.all([
    Lead.countDocuments(inRange),
    Lead.countDocuments({ createdAt: { $gte: today } }),
    Lead.aggregate([{ $match: inRange }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Query.countDocuments({ status: { $in: ["Open", "In progress"] } }),
    Query.aggregate([{ $match: { status: "Open" } }, { $group: { _id: "$type", count: { $sum: 1 } } }]),
    Session.countDocuments(inRange),
    Session.countDocuments({ lastMessageAt: { $gte: today } }),
    Customer.countDocuments({}),
    Customer.countDocuments(inRange),
    ChatLog.countDocuments(inRange),
    ChatLog.countDocuments({ createdAt: { $gte: today } }),
    series(Lead, "createdAt", { unit: "day", count: 14 }),
    series(Session, "createdAt", { unit: "day", count: 14 }),
    series(ChatLog, "createdAt", { unit: "day", count: 14 }),
    series(Lead, "createdAt", { unit: "month", count: 12 }),
    series(Session, "createdAt", { unit: "month", count: 12 }),
    topBy(inRange, "country"),
    topBy(inRange, "visaType"),
    topBy(inRange, "assignedAgent"),
    aiService.status(),
  ]);

  return {
    range,
    from,
    kpis: {
      leads: leadsInRange,
      conversations: sessionsInRange,
      messages: messagesInRange,
      newCustomers,
      customers: customersTotal,
      openQueries,
      conversion: sessionsInRange ? Math.round((leadsInRange / sessionsInRange) * 1000) / 10 : 0,
    },
    trends: { leads: leadsDaily, conversations: sessionsDaily, messages: messagesDaily },
    activity: { leads: leadsMonthly, conversations: sessionsMonthly },
    top: { countries: topCountries, visaTypes: topVisaTypes, agents: topAgents },
    leads: { today: leadsToday, byStatus: Object.fromEntries(leadsByStatus.map((x) => [x._id || "Unknown", x.count])) },
    queries: { open: openQueries, openByType: Object.fromEntries(queriesByType.map((x) => [x._id, x.count])) },
    sessions: { activeToday: sessionsToday },
    customers: { total: customersTotal },
    messages: { today: messagesToday },
    ai,
  };
};
