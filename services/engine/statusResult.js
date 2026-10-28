/**
 * Engine step: Status Result (ported from n8n node "Status Result", V18.8).
 * Logic bilkul same hai; n8n ke $(), $input aur static data ab
 * workflow.service ka runtime (services/engine/runtime.js) deta hai.
 */
const H = require("./helpers");

module.exports = function statusResult(rt) {
  const { $, $input, $getWorkflowStaticData } = rt;
  const { toAsciiDigits, norm, has, yes, splitList, titleCase, safeJson, esc, containsTerm, condOk, resolveCountry, visaRows, resolveVisa, supportedVisaNames, refusedVisaNames, activeCountries, pickQuestions, fieldDefFor, relevantFieldDefs, normPhone, prettyPhone, YES_RE, NO_RE, matchChoice, NOT_NAME, TD_MONTHS, TD_NAMES, TD_ALT, TD_AMBIG, tdMonth, tdDays, tdIso, tdYear, NB, friendlyDate, findDateExpr, resolveTravelDate, FLEX_DATE_RE, validateField, detectLang, EN_WORDS, RU_WORDS, latinLangVote, CLOSING_RE, isClosing, scriptOf, langScript, parseRating, pkToday } = H;
  const getCfg = () => rt.cfg;
  {
    const g = $('Guard').first().json;
    const state = JSON.parse(JSON.stringify(g.state)); const plan = JSON.parse(JSON.stringify(g.plan));
    const rows = $input.all().map(i => i.json).filter(r => r && r.LeadID);
    const q = g.statusQuery || {};
    const hit = rows.find(r => String(r.LeadID).trim().toUpperCase() === String(q.leadId).trim().toUpperCase());
    if (hit) {
      plan.next = { type: 'status_result', referenceId: hit.LeadID, country: hit.Country, visaType: hit.VisaType, status: hit.Status || 'In review', lastUpdated: String(hit.LastUpdated || '').slice(0, 10) };
      state.status = null;
      // Reference + number se tasdeeq ho gayi: customer ki pehchaan yaad rakho, dobara naam/number nahi poochna
      state.data = state.data || {};
      if (!String(state.data.fullName || '').trim() && hit.FullName) state.data.fullName = String(hit.FullName).trim();
      if (!String(state.data.whatsapp || '').trim()) state.data.whatsapp = String(hit.WhatsApp || q.whatsapp || '').trim();
      state.lastLead = { leadId: hit.LeadID, country: hit.Country || '', visaType: hit.VisaType || '', status: hit.Status || '', agent: hit.AssignedAgent || '', createdAt: String(hit.CreatedAt || '').slice(0, 10) };
    } else {
      const attempts = (state.status && state.status.attempts) || 0;
      plan.next = { type: 'status_not_found', attemptsLeft: Math.max(0, 4 - attempts) };
      if (state.status) state.status.leadId = null;
      if (attempts >= 4) state.status = null;
    }
    return [{ json: { ...g, state, plan } }];
  }
};
