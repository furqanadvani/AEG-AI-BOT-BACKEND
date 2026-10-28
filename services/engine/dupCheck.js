/**
 * Engine step: Dup Check (ported from n8n node "Dup Check", V18.8).
 * Logic bilkul same hai; n8n ke $(), $input aur static data ab
 * workflow.service ka runtime (services/engine/runtime.js) deta hai.
 */
const H = require("./helpers");

module.exports = function dupCheck(rt) {
  const { $, $input, $getWorkflowStaticData } = rt;
  const { toAsciiDigits, norm, has, yes, splitList, titleCase, safeJson, esc, containsTerm, condOk, resolveCountry, visaRows, resolveVisa, supportedVisaNames, refusedVisaNames, activeCountries, pickQuestions, fieldDefFor, relevantFieldDefs, normPhone, prettyPhone, YES_RE, NO_RE, matchChoice, NOT_NAME, TD_MONTHS, TD_NAMES, TD_ALT, TD_AMBIG, tdMonth, tdDays, tdIso, tdYear, NB, friendlyDate, findDateExpr, resolveTravelDate, FLEX_DATE_RE, validateField, detectLang, EN_WORDS, RU_WORDS, latinLangVote, CLOSING_RE, isClosing, scriptOf, langScript, parseRating, pkToday } = H;
  const getCfg = () => rt.cfg;
  {
    const g = $('Guard').first().json;
    const state = JSON.parse(JSON.stringify(g.state)); const plan = JSON.parse(JSON.stringify(g.plan));
    const rows = $input.all().map(i => i.json).filter(r => r && r.LeadID);
    const closed = new Set(['closed', 'rejected', 'cancelled', 'canceled', 'completed', 'approved', 'withdrawn', 'done']);
    const n = v => String(v || '').trim().toLowerCase();
    const dup = rows.find(r => n(r.Country) === n(g.lead.Country) && n(r.VisaType) === n(g.lead.VisaType) && !closed.has(n(r.Status)));
    if (dup) { plan.next = { type: 'duplicate', referenceId: dup.LeadID, status: dup.Status || 'New' }; state.stage = 'submitted'; state.leadId = dup.LeadID; state.afterSubmitReplies = 0; }
    return [{ json: { ...g, state, plan, isDuplicate: !!dup } }];
  }
};
