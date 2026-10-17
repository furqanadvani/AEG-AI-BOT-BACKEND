/**
 * Internal CRM (Phase 2): generic REST adapter.
 * CRM ki API docs aate hi: Integrations (type=crm) mein baseUrl, endpoints aur field maps set karein.
 * Agar CRM ka format bilkul alag ho to sirf yeh file badalni hai; baqi system same rahega.
 */
const { request } = require("./http");
const integrationService = require("../integration.service");

const getConn = async () => integrationService.getResolved("crm");

const headersOf = (crm) => {
  const h = {};
  if (crm.secrets.apiKey) h[crm.config.authHeader || "Authorization"] = crm.config.authScheme ? `${crm.config.authScheme} ${crm.secrets.apiKey}` : crm.secrets.apiKey;
  return h;
};

const mapFields = (obj, map = {}) => {
  if (!map || !Object.keys(map).length) return obj;
  const out = {};
  for (const [ours, theirs] of Object.entries(map)) if (obj[ours] !== undefined) out[theirs] = obj[ours];
  return out;
};

const call = async (crm, endpointKey, body, params = {}, method = "POST") => {
  let path = crm.config.endpoints?.[endpointKey];
  if (!path) throw new Error(`CRM endpoint "${endpointKey}" is not configured`);
  for (const [k, v] of Object.entries(params)) path = path.replace(`:${k}`, encodeURIComponent(v));
  return request(`${String(crm.config.baseUrl).replace(/\/+$/, "")}${path}`, { method, headers: headersOf(crm), body, timeoutMs: 15000 });
};

const isEnabled = async () => {
  const crm = await getConn();
  return !!(crm.isEnabled && crm.config.baseUrl);
};

const pushLead = async (lead, customer) => {
  const crm = await getConn();
  if (!crm.isEnabled || !crm.config.baseUrl) return { skipped: true };
  const payload = mapFields({ ...lead, customer: customer ? mapFields(customer, crm.config.customerFieldMap) : null }, crm.config.leadFieldMap);
  const r = lead.crmSync?.crmId
    ? await call(crm, "updateLead", payload, { crmId: lead.crmSync.crmId }, "PUT")
    : await call(crm, "createLead", payload);
  return { crmId: r?.id || r?._id || r?.data?.id || lead.crmSync?.crmId || null, response: r };
};

const ping = async () => {
  const crm = await getConn();
  if (!crm.config.baseUrl) throw new Error("CRM baseUrl missing");
  return call(crm, "ping", undefined, {}, "GET");
};

module.exports = { pushLead, ping, isEnabled };
