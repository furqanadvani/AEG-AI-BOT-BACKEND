/**
 * Engine step: Lead Created (ported from n8n node "Lead Created", V18.8).
 * Logic bilkul same hai; n8n ke $(), $input aur static data ab
 * workflow.service ka runtime (services/engine/runtime.js) deta hai.
 */
const H = require("./helpers");

module.exports = function leadCreated(rt) {
  const { $, $input, $getWorkflowStaticData } = rt;
  const { toAsciiDigits, norm, has, yes, splitList, titleCase, safeJson, esc, containsTerm, condOk, resolveCountry, visaRows, resolveVisa, supportedVisaNames, refusedVisaNames, activeCountries, pickQuestions, fieldDefFor, relevantFieldDefs, normPhone, prettyPhone, YES_RE, NO_RE, matchChoice, NOT_NAME, TD_MONTHS, TD_NAMES, TD_ALT, TD_AMBIG, tdMonth, tdDays, tdIso, tdYear, NB, friendlyDate, findDateExpr, resolveTravelDate, FLEX_DATE_RE, validateField, detectLang, EN_WORDS, RU_WORDS, latinLangVote, CLOSING_RE, isClosing, scriptOf, langScript, parseRating, pkToday } = H;
  const getCfg = () => rt.cfg;
  {
    const d = $('Dup Check').first().json;
    const S = (($getWorkflowStaticData('global').cfg) || {}).settings || {};
    const yesv = v => /^(yes|y|true|1|haan|han|ji|on|active)$/i.test(String(v ?? '').trim());
    const state = JSON.parse(JSON.stringify(d.state)); const plan = JSON.parse(JSON.stringify(d.plan));
    let ok = true; try { const a = $('Append Lead').first().json; if (!a || a.error) ok = false; } catch (e) { ok = false; }
    if (ok) {
      const askFeedback = (String(S.AskFeedback ?? '').trim() === '' ? true : yesv(S.AskFeedback)) && !state.feedbackGiven;
      state.stage = 'submitted'; state.leadId = d.lead.LeadID; state.openQuestions = []; state.afterSubmitReplies = 0; state.awaitingFeedback = askFeedback;
      plan.next = { type: 'lead_created', referenceId: d.lead.LeadID, askFeedback };
    } else plan.next = { type: 'lead_failed' };
    // Email ab customer ko jawab dene ke BAAD jati hai (Finalize > IF Send Email)
    return [{ json: { ...d, state, plan } }];
  }
};
