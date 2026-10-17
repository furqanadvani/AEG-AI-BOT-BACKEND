/**
 * Engine step: Query Logged (ported from n8n node "Query Logged", V18.8).
 * Logic bilkul same hai; n8n ke $(), $input aur static data ab
 * workflow.service ka runtime (services/engine/runtime.js) deta hai.
 */
const H = require("./helpers");

module.exports = function queryLogged(rt) {
  const { $, $input, $getWorkflowStaticData } = rt;
  const { toAsciiDigits, norm, has, yes, splitList, titleCase, safeJson, esc, containsTerm, condOk, resolveCountry, visaRows, resolveVisa, supportedVisaNames, refusedVisaNames, activeCountries, pickQuestions, fieldDefFor, relevantFieldDefs, normPhone, prettyPhone, YES_RE, NO_RE, matchChoice, NOT_NAME, TD_MONTHS, TD_NAMES, TD_ALT, TD_AMBIG, tdMonth, tdDays, tdIso, tdYear, NB, friendlyDate, findDateExpr, resolveTravelDate, FLEX_DATE_RE, validateField, detectLang, EN_WORDS, RU_WORDS, latinLangVote, CLOSING_RE, isClosing, scriptOf, langScript, parseRating, pkToday } = H;
  const getCfg = () => rt.cfg;
  {
    const g = $('Guard').first().json;
    const state = JSON.parse(JSON.stringify(g.state)); const plan = JSON.parse(JSON.stringify(g.plan));
    let ok = true; try { const a = $('Append Query').first().json; if (!a || a.error) ok = false; } catch (e) { ok = false; }
    // Cancel ka "Lost" record: customer ko wahi cancel wala jawab, "team ko bhej diya" nahi
    if (g.query && g.query.Type === 'LOST') { /* plan.next (cancelled) waisa hi */ }
    else plan.next = ok ? { type: 'query_logged', queryType: g.query.Type, referenceId: g.query.QueryID } : { type: 'query_failed' };
    if (ok && plan.resume) { state.lastAsked = plan.resume.field; state.askCount = { [plan.resume.field]: plan.resume.attempt || 1 }; }
    if (!ok && g.query && g.query.Type === 'HUMAN') state.lastHumanQueryAt = null;
    return [{ json: { ...g, state, plan } }];
  }
};
