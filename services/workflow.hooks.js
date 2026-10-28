/**
 * Workflow ke baad ke kaam: agent email, CRM push, notifications.
 * Yahan se phase 2 (CRM / WhatsApp) plug hota hai.
 */
const Lead = require("../models/Lead");
const Customer = require("../models/Customer");
const settingService = require("./setting.service");
const notificationService = require("./notification.service");
const emailProvider = require("./integrations/email.provider");
const crmProvider = require("./integrations/crm.provider");
const { ACL_MODULES } = require("../utils/aclConstants");

const syncLeadToCrm = async (leadObjectId) => {
  if (!(await crmProvider.isEnabled())) return { skipped: true };
  const lead = await Lead.findById(leadObjectId).lean();
  if (!lead) return { skipped: true };
  const customer = lead.customer ? await Customer.findById(lead.customer).lean() : null;
  try {
    await Lead.updateOne({ _id: lead._id }, { $set: { "crmSync.status": "pending" } });
    const r = await crmProvider.pushLead(lead, customer);
    if (r.skipped) return r;
    await Lead.updateOne({ _id: lead._id }, { $set: { "crmSync.status": "synced", "crmSync.crmId": r.crmId, "crmSync.syncedAt": new Date(), "crmSync.error": null } });
    return { synced: true, crmId: r.crmId };
  } catch (e) {
    await Lead.updateOne({ _id: lead._id }, { $set: { "crmSync.status": "failed", "crmSync.error": e.message.slice(0, 500) } });
    notificationService.notify({
      type: "INTEGRATION_ERROR", level: "error", title: `CRM sync failed for ${lead.leadId}`, message: e.message.slice(0, 300),
      module: ACL_MODULES.INTEGRATIONS, dedupeKey: `crm_fail:${lead.leadId}`,
    }).catch(() => {});
    return { failed: true, error: e.message };
  }
};

const onLeadCreated = async ({ lead, email, refused = false }) => {
  const tasks = [];
  // V19: "Not processed" demand lead: CRM / agent email nahi, sirf admin ke liye notification (kaun si demand aa rahi hai)
  if (refused) {
    await notificationService.notify({
      type: "REFUSED_DEMAND", level: "info", title: `Not-processed demand captured (${lead.leadId})`,
      message: "A customer asked for a country / visa type we do not process. Name and WhatsApp were saved as a lead.",
      meta: { leadId: lead.leadId, _id: lead._id }, module: ACL_MODULES.LEADS,
    }).catch(() => {});
    return;
  }
  if (email && email.to && (await settingService.getBool("NewLeadEmailEnabled", true))) {
    tasks.push(emailProvider.send({ to: email.to, subject: email.subject, html: email.html }));
  }
  tasks.push(syncLeadToCrm(lead._id));
  tasks.push(notificationService.notify({
    type: "NEW_LEAD", level: "success", title: `New lead ${lead.leadId}`, message: "The bot created a new lead.",
    meta: { leadId: lead.leadId, _id: lead._id }, module: ACL_MODULES.LEADS,
  }));
  await Promise.allSettled(tasks);
};

const onHumanRequest = async ({ query }) => {
  await notificationService.notify({
    type: "HUMAN_REQUEST", level: "warning", title: `Customer wants to talk to a person (${query.FullName || query.WhatsApp || "unknown"})`,
    message: String(query.Question || "").slice(0, 300), meta: { queryId: query.QueryID, whatsapp: query.WhatsApp }, module: ACL_MODULES.QUERIES,
  });
};

const onHumanTakeoverMessage = async () => {};

module.exports = { onLeadCreated, onHumanRequest, onHumanTakeoverMessage, syncLeadToCrm };
