/**
 * Engine step: Guard (ported from n8n node "Guard", V18.8).
 * Logic bilkul same hai; n8n ke $(), $input aur static data ab
 * workflow.service ka runtime (services/engine/runtime.js) deta hai.
 */
const H = require("./helpers");

module.exports = function guard(rt) {
  const { $, $input, $getWorkflowStaticData } = rt;
  const { extractFacts, PK_CITIES, parseTravellers, toAsciiDigits, norm, has, yes, splitList, titleCase, safeJson, esc, containsTerm, condOk, resolveCountry, visaRows, resolveVisa, supportedVisaNames, refusedVisaNames, activeCountries, pickQuestions, fieldDefFor, relevantFieldDefs, normPhone, prettyPhone, YES_RE, NO_RE, matchChoice, NOT_NAME, TD_MONTHS, TD_NAMES, TD_ALT, TD_AMBIG, tdMonth, tdDays, tdIso, tdYear, NB, friendlyDate, findDateExpr, resolveTravelDate, FLEX_DATE_RE, validateField, detectLang, EN_WORDS, RU_WORDS, latinLangVote, CLOSING_RE, isClosing, scriptOf, langScript, parseRating, pkToday } = H;
  const getCfg = () => rt.cfg;
  {
    // GUARD: AI ne jo samjha usay check karta hai, data save karta hai, aur tay karta hai ke agla qadam kya ho.
    // Yahan koi customer-facing text nahi likha jata; jawab AI #2 likhta hai.
    // Loop se bachao: har sawal ki ginti (askCount), confirm reminders, soft offers aur human requests sab limited hain.
    const ctx = $('Build Context').first().json;
    const cfg = getCfg(), S = cfg.settings || {};
    const state = JSON.parse(JSON.stringify(ctx.state));
    let data = state.data;
    const msg = String(ctx.text || '');
    const nowIso = new Date().toISOString();
    // V19: ek hi millisecond mein do queries (1000 customers) ka ID takrao na ho
    const uid = (p) => p + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
    const prevAsked = state.lastAsked;
    // Pichle turn ki suggest ki hui date (sirf agle ek message tak valid)
    const pendingDate = state.pendingDate || null; state.pendingDate = null;
    // Pichle turn mein number dohra kar confirm manga tha
    const pendingPhone = state.pendingPhone || null; state.pendingPhone = null;
    // V18.8: pichle turn mein poocha tha "kya aapka matlab yeh hai?" (sirf agle ek message tak valid)
    const pendingClarify = state.pendingClarify || null; state.pendingClarify = null;
    const hadAppBefore = ['country', 'visaType', 'travelDate', 'duration', 'travellers'].some(f => has((ctx.state.data || {})[f]));
    // Customer ne khud application shuru ki? (sirf sawal mein UAE likhna application nahi)
    const appStartedBefore = state.appStarted !== undefined ? !!state.appStarted : (hadAppBefore && !!state.lastAsked);
    const CORE = new Set(['country', 'visaType', 'fullName', 'whatsapp']);
    const SKIP_VALUE = S.SkippedFieldValue || 'Not shared (team will discuss)';
    // ---------- Mana wali countries: Countries tab mein jin ka Active = No hai ----------
    // Nayi country mana karni ho: Countries tab mein row add karein (Aliases + Cities ke saath) aur Active = No.
    const BLOCKED_COUNTRIES = (cfg.countries || []).filter(c => !c.active);
    const blockedTerms = c => [c.name, ...c.aliases, ...c.cities].filter(Boolean);
    function blockedCountryOf(v) {
      const n = norm(v); if (!n) return null;
      for (const c of BLOCKED_COUNTRIES) for (const t of blockedTerms(c)) { const tn = norm(t); if (tn && (n === tn || (tn.length >= 4 && containsTerm(n, tn)))) return c.name; }
      return null;
    }
    function blockedInMessage(m) {
      const s = String(m || ''); const allCaps = s === s.toUpperCase();
      for (const c of BLOCKED_COUNTRIES) for (const t of blockedTerms(c)) {
        if (norm(t).length >= 4) { if (containsTerm(s, t)) return c.name; }
        else if (!allCaps && /[A-Z]/.test(t) && t === t.toUpperCase()) { // chhote naam (US, USA) sirf CAPITAL mein, taake "us ka" / "help us" na pakra jaye
          const e = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp('(^|[^A-Za-z])' + e + '(?![A-Za-z])').test(s)) return c.name;
        }
      }
      return null;
    }
    const looksLikeCountry = t => { const w = t.split(/\s+/).filter(Boolean); return t.length >= 2 && t.length <= 40 && w.length <= 4 && /^[\p{L}\p{M} .'&()-]+$/u.test(t) && !/\b(visa|viza|apply|tourist|visit|business|student|work|job|status|team|agent|yes|no|haan|nahi|nhi|pata|ok|okay|koi|any|anywhere|kahin|kahi|abroad|bahar|country|countries|mulk|skip)\b/i.test(t); };
    // Hum duniya ki har country ka visa karte hain (sirf Active = No wali mana): jo country sheet mein nahi woh bhi qabool
    function countryVerdict(v) {
      const b = blockedCountryOf(v); if (b) return { ok: false, reason: 'blocked_country', detail: b };
      const rc = resolveCountry(cfg, v);
      if (rc) return rc.country.active ? null : { ok: false, reason: 'blocked_country', detail: rc.country.name };
      const t = String(v || '').trim();
      if (aiOk && looksLikeCountry(t)) return { ok: true, value: /^[A-Z]{2,4}$/.test(t) ? t : (/^[a-z .'-]+$/i.test(t) ? titleCase(t.toLowerCase()) : t) };
      return { ok: false, reason: 'unclear_country' };
    }
    const COUNTRY_LIST_RE = /\b(which|what|konsi|konsy|konse|konsa|kaunsi|kaunse|kis kis|kin kin|kon kon|kaun kaun|kon si|kon se|kon sy|kaun si|kaun se)\b[^?\u061F]{0,40}\b(countr(y|ies|ys)|mulk|mulko|mulkon|mumalik|destinations?)\b|\b(countr(y|ies)|mulk|mulkon)\b[^?\u061F]{0,30}\b(list|kon kon|kaun kaun|kis kis|kin kin)\b|(کون کون|کن کن|کس کس)\s*(سے|سی)?\s*(ممالک|ملک|ملکوں)/i;

    // ---------- 1. Samajh (AI #1 ya code) ----------
    const blankU = () => ({ language: '', intent: 'other', updates: [], question: null, confirm: 'none', status_lead_id: null, status_whatsapp: null, frustrated: false, unclear: false, meaning_guess: null });
    let u = null, aiOk = false, synthetic = false;
    if (ctx.skipReason) {
      synthetic = true; aiOk = true; u = blankU();
      if (ctx.skipReason === 'direct_answer' && ctx.directUpdate) { u.intent = 'providing_info'; u.updates = [ctx.directUpdate]; }
    } else {
      try {
        const r = $('AI Understand').first().json || {};
        const c = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
        if (c) { u = JSON.parse(String(c).replace(/```json|```/g, '').trim()); aiOk = true; }
      } catch (e) {}
    }
    if (!u || typeof u !== 'object') {
      u = blankU();
      // AI #1 fail: seedhe alfaaz se kam az kam irada samjho
      const t = norm(msg);
      const isQ = /[?\u061F]/.test(msg) || /\b(kya|kia|kitn\w*|kab|kaise|kesy|what|how|when|why|fees?)\b/.test(t);
      if (/\b(status|track|truck|tracking|reference)\b|aeg [a-z0-9]{4,}/.test(t)) u.intent = 'status';
      else if (/\b(agent|insaan|human|representative|baat karwao|baat karni)\b/.test(t)) u.intent = 'human';
      else if (/\b(visa|viza|apply)\b/.test(t) || /ویزا|ویزہ/.test(msg)) u.intent = isQ ? 'question' : 'apply';
      else if (/^(hi|hello|hey|salam|assalam|aoa)\b/.test(t) || /^السلام/.test(msg)) u.intent = 'greeting';
      // V19.1: "dubai jana chahta hoon" / "mera naam X hai" bhi irada hai (pehle sirf "visa/apply" pakra jata tha)
      if (u.intent === 'other' && !isQ) {
        const f0 = extractFacts(msg);
        const destHit = (cfg.countries || []).some(c => [c.name, ...c.aliases, ...c.cities].some(x => norm(x).length >= 3 && containsTerm(msg, x)));
        if (f0.travelIntent || destHit) u.intent = 'apply'; else if (f0.name || f0.departure) u.intent = 'providing_info';
      }
      // Backend V1: AI na ho (limit / fail) to confirm step code khud samjhe, taake lead phir bhi ban sake
      if (state.stage === 'confirming') {
        if (YES_RE.test(t) || /^(confirm|confirmed|confrim|submit|ok|okay|ok confirm|theek hai|thik hai|sahi hai|correct|done|کنفرم)$/.test(t)) u.confirm = 'yes';
        else if (/^(edit|change|badlo|tabdeel|correction|ghalat|galat|wrong)\b/.test(t)) u.confirm = 'edit';
        else if (NO_RE.test(t)) u.confirm = 'no';
      }
    }
    u.updates = Array.isArray(u.updates) ? u.updates : [];
    // AI fail ho jaye to kam se kam pichhle sawal ka seedha jawab save karne ki koshish
    // V19.1: jumle se naam aur "kahan se" code khud nikalta hai (AI ho ya na ho). Poora jumla naam nahi samjha jata
    const msgFacts = extractFacts(msg);
    // Salam = greeting, "dubai jana chahta hoon" = apply (AI "other" kahe tab bhi), taake form shuru ho aur bot sirf "kaise madad karun" na kahe
    const isQmsg = /[?\u061F]/.test(msg) || /\b(kya|kia|kitn\w*|kab|kaise|kesy|what|how|when|why|fees?)\b/i.test(norm(msg));
    if (u.intent === 'other' && /^(assalam|asalam|aslam|salam|slam|aoa|a o a|hi|hello|hey|السلام)/i.test(norm(msg) || msg) && !msgFacts.name && !msgFacts.travelIntent) u.intent = 'greeting';
    if (['other', 'smalltalk', 'greeting', 'providing_info'].includes(u.intent) && msgFacts.travelIntent && !isQmsg) u.intent = 'apply';
    if (msgFacts.name && !has(data.fullName) && !u.updates.some(x => x.field === 'fullName')) u.updates.push({ field: 'fullName', value: msgFacts.name });
    if (msgFacts.departure && !has(data.departureCity) && !u.updates.some(x => x.field === 'departureCity')) u.updates.push({ field: 'departureCity', value: msgFacts.departure });
    if (!aiOk && state.lastAsked && msg.length <= 60 && !u.updates.some(x => x.field === state.lastAsked)) {
      const d0 = fieldDefFor(cfg, data, state.lastAsked);
      const plainOk = !d0 || d0.type !== 'name' || validateField(cfg, data, d0, msg).ok; // sentence ko naam samajh kar "ghalat naam" nahi kehna
      const isDeparture = !!msgFacts.departure; // "Karachi se safar" kisi sawal ka jawab nahi, sirf departure
      if (plainOk && !isDeparture) u.updates.push({ field: state.lastAsked, value: msg });
    }

    // ---------- Zaban: chhote messages ("ok", "2", naam) par zaban nahi badalti ----------
    const letterWords = msg.split(/\s+/).filter(w => /\p{L}/u.test(w)).length;
    const prevLang = state.language || '';
    let lang = (aiOk && !synthetic && u.language) ? u.language : detectLang(msg);
    // Code ka faisla AI par bhari: saaf English message ko Roman Urdu (ya ulta) nahi samjha jayega
    const vote = scriptOf(msg) === 'latin' ? latinLangVote(msg) : '';
    if (vote && ['en', 'roman_ur'].includes(lang || 'en') && lang !== vote) lang = vote;
    if (scriptOf(msg) === 'arabic' && ['en', 'roman_ur', 'other', ''].includes(lang || '')) lang = detectLang(msg);
    if (prevLang) {
      const sameScript = scriptOf(msg) === 'none' || langScript(prevLang) === 'any' || scriptOf(msg) === langScript(prevLang);
      // 1-2 alfaaz (ok, 2, jee) par zaban nahi badlti, chahe haroof English hon ya Urdu
      if (!lang || letterWords < 3) lang = prevLang;
    }
    if (ctx.clarifiedFrom && prevLang) lang = prevLang; // V18.8: "haan" ke baad hamara apna andaza text hai, zaban customer wali hi rahe
    state.language = lang || prevLang || detectLang(msg) || 'roman_ur';
    if (letterWords >= 3) state.languageSample = msg.slice(0, 200);
    state.turns = (state.turns || 0) + 1;

    const plan = { saved: [], issues: [], refusedVisa: null, unsupportedCountry: null, forwardVisa: null, question: u.question || null, frustrated: !!u.frustrated,
      next: null, resume: null, skippedField: null, notes: [] };
    // "Kya aap AI / bot ho?" : sach batana hai; yeh team ke liye unanswered sawal nahi
    const IDENTITY_RE = /\b(are|r)\s*(you|u)\s*(an?\s*)?(ai|bot|robot|human|real person|machine|chat ?gpt|computer)\b|\b(you|u)\s*(r|are)\s*(an?\s*)?(ai|bot|robot)\b|\b(ap|aap)\s*(koi\s*)?(bot|ai|robot|insaan|insan|machine|computer)\s*(ho|hain|hai|hn)\b|\b(bot|robot)\s*(ho|hain|hai)\b|(کیا\s*آپ\s*(روبوٹ|بوٹ|انسان|مشین))/i;
    if (IDENTITY_RE.test(msg)) { plan.identityAsk = true; plan.question = null; }
    // Pichhle message wala sawal dobara na aaye jab customer ne kuch naya nahi poocha
    if (plan.question && !/[?\u061F]/.test(msg) && norm(plan.question) === norm(state.lastQuestion)) plan.question = null;
    let sideEffect = 'none', lead = null, email = null, statusQuery = null, query = null, feedbackRating = null;

    // ---------- helpers ----------
    const hasApp = () => ['country', 'visaType', 'travelDate', 'duration', 'travellers'].some(f => has(data[f]));
    function freshData() { const keep = {}; if (has(data.fullName)) keep.fullName = data.fullName; if (has(data.whatsapp)) keep.whatsapp = data.whatsapp; return keep; }
    function resetFlow() { state.askCount = {}; state.confirmReminders = 0; state.lastSoftTurn = 0; state.afterSubmitReplies = 0; }
    function nextFieldPlan(soft) {
      for (let i = 0; i < 30; i++) { // max 30 dafa: kabhi infinite loop nahi
        const qs = pickQuestions(cfg, data); const missing = qs.filter(q => !has(data[q.field]));
        if (!missing.length) return null;
        let q = missing[0];
        if (plan.refusedVisa && !has(data.visaType)) q = missing.find(m => m.field === 'visaType') || q;
        if (plan.unsupportedCountry && !has(data.country)) q = missing.find(m => m.field === 'country') || q;
        const prevCount = (prevAsked === q.field && !plan.saved.some(s => s.field === q.field)) ? (state.askCount[q.field] || 0) : 0;
        // 3 dafa poochne par bhi jawab na mile to ghair-zaroori sawal chhor kar aage barho (team baad mein pooch legi)
        if (!soft && prevCount >= 3 && !CORE.has(q.field) && !plan.question && !plan.issues.some(x => x.field === q.field)) {
          data[q.field] = SKIP_VALUE; plan.skippedField = { label: q.label }; plan.notes.push('skipped_' + q.field); continue;
        }
        const answeredButRejected = (plan.refusedVisa && q.field === 'visaType') || (plan.unsupportedCountry && q.field === 'country');
        const engagedElsewhere = plan.saved.some(s => s.field !== q.field) || plan.issues.some(i => i.field !== q.field);
        const softIssue = plan.issues.some(i => i.field === q.field && i.soft) || !!plan.clarify || !!plan.clarifyRejected || !!ctx.clarifiedFrom;
        const attempt = (soft || answeredButRejected) ? 1 : ((plan.question || engagedElsewhere || softIssue) ? Math.max(prevCount, 1) : prevCount + 1);
        const options = q.type === 'choice' ? splitList(q.options) : q.type === 'visatype' ? supportedVisaNames(cfg, data.country) : [];
        return { type: 'ask_field', field: q.field, label: q.label, ask: q.ask, why: q.why, fieldType: q.type, options, soft: !!soft, attempt };
      }
      return null;
    }
    // Purpose: sheet ke aliases + aam alfaaz (AI se chhoot jaye to code pakre)
    const PURPOSE_HINTS = [
      { re: /(umrah|umra|عمرہ)/i, names: ['umrah'] }, { re: /(\bhajj\b|\bhaj\b|حج)/i, names: ['hajj'] },
      { re: /(transit)/i, names: ['transit'] }, { re: /(medical|ilaj|ilaaj|treatment|hospital)/i, names: ['medical'] },
      { re: /(study|student|padhai|parhai|parhne|university|college|admission|course|degree)/i, names: ['student', 'study'] },
      { re: /(business|bussiness|meeting|conference|exhibition|expo|trade|karobar|kaarobar|client)/i, names: ['business'] },
      { re: /(\bjob\b|naukri|nokri|\bwork\b|employment|rozgar|work permit)/i, names: ['work', 'job', 'employment'] },
      { re: /(ghoom|ghum|ghoum|sair|seer|sightsee|holiday|vacation|\btour|tourist|honeymoon|chutti)/i, names: ['tourist', 'visit', 'tour'] }];
    const WEAK_TOURIST = /(family|milne|rishtedar|relatives|\bvisit\b|shadi|wedding|ghar walon)/i;
    function purposeFromText(text, weakOk) {
      const rows = visaRows(cfg, data.country);
      for (const r of rows) if ([r.name, ...r.aliases].some(t => norm(t).length >= 3 && containsTerm(text, t))) return r.name;
      const hints = weakOk ? PURPOSE_HINTS.concat([{ re: WEAK_TOURIST, names: ['tourist', 'visit', 'tour'] }]) : PURPOSE_HINTS;
      for (const h of hints) if (h.re.test(String(text || ''))) {
        const row = rows.find(r => h.names.some(nm => norm(r.name).includes(nm)));
        return row ? row.name : titleCase(h.names[0]);
      }
      return null;
    }
    // Duration ke jawab mein date = wapsi ki date: travel date se din gin kar
    const DUR_WORDS = /\b(din|dino|day|days|week|weeks|hafte|hafta|haftay|month|months|mahine|mahina|year|years|saal|hour|hours|hrs|ghante|ghantay|night|nights|raat)\b/i;
    function returnDateInfo(text, travelVal) {
      const e = findDateExpr(text); if (!e || e.kind !== 'day') return null;
      const tv = String(travelVal || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!tv) { const r0 = resolveTravelDate(text, pkToday(), S); return (r0 && r0.ok && /^\d{4}-/.test(r0.value)) ? { ok: true, value: `Return ${friendlyDate(r0.value)}`, label: `return on ${friendlyDate(r0.value)}` } : null; }
      const tIso = tv[0];
      let y = e.yearGiven ? e.y : +tv[1];
      if (e.mo < 1 || e.mo > 12 || e.d < 1 || e.d > tdDays(y, e.mo)) return { ok: false, reason: 'invalid_date' };
      let ret = tdIso(y, e.mo, e.d);
      // Saal sirf tab badlo jab wapsi ka mahina travel se pehle ho (20 Dec jana, 5 Jan wapsi); warna wapsi travel se pehle = ghalti
      if (!e.yearGiven && ret <= tIso) { if (e.mo >= +tv[2]) return { ok: false, reason: 'return_before_travel', detail: friendlyDate(tIso) }; y += 1; if (e.d > tdDays(y, e.mo)) return { ok: false, reason: 'invalid_date' }; ret = tdIso(y, e.mo, e.d); }
      const days = Math.round((Date.parse(ret) - Date.parse(tIso)) / 86400000);
      if (days <= 0) return { ok: false, reason: 'return_before_travel', detail: friendlyDate(tIso) };
      if (days > 366) return { ok: false, reason: 'unclear_duration' };
      return { ok: true, value: `${days} days (return ${friendlyDate(ret)})`, label: `${days} days, returning on ${friendlyDate(ret)}` };
    }
    function summaryList() { return pickQuestions(cfg, data).map(q => ({ field: q.field, label: q.label, value: data[q.field] || '' })); }
    function pickAgent(country) {
      const a = cfg.agents.find(x => norm(x.country) === norm(country)) || cfg.agents.find(x => norm(x.country) === 'all');
      return a || { name: 'Unassigned', email: S.FallbackAgentEmail || '' };
    }

    // ---------- 0. Flood / khali message ----------
    if (ctx.skipReason === 'throttled') { plan.next = { type: 'throttled' }; plan.question = null; u.updates = []; }
    else if (ctx.skipReason === 'empty') { plan.next = { type: 'help' }; }

    // ---------- 0b. Feedback (lead ke baad sirf ek dafa poocha jata hai) ----------
    if (!plan.next && state.awaitingFeedback) {
      state.awaitingFeedback = false; // rating na di to dobara nahi poochenge
      const rating = parseRating(msg);
      if (rating) { feedbackRating = rating; state.feedbackGiven = true; state.feedback = { rating, at: nowIso }; plan.next = { type: 'feedback_thanks', rating }; plan.question = null; u.updates = []; }
    }

    // ---------- 0c. Kaam mukammal ho chuka aur customer "nahi / shukriya" kahe: khuda hafiz, koi naya sawal nahi ----------
    const CLOSERS = ['refused_final', 'refused_lead_created', 'refused_dropped', 'status_result', 'status_not_found', 'status_locked', 'lead_created', 'duplicate', 'after_submit', 'query_logged', 'query_dropped', 'feedback_thanks', 'human_already', 'help', 'answer_only', 'offer_apply', 'cancelled', 'goodbye', 'welcome', 'blocked_country'];
    if (!plan.next && !state.lastAsked && CLOSERS.includes(state.lastNext) && (ctx.skipReason === 'closing' || (isClosing(msg) && !u.updates.length && !['apply', 'status', 'human', 'restart'].includes(u.intent)))) {
      plan.next = { type: 'goodbye', repeat: state.lastNext === 'goodbye' }; plan.question = null; u.updates = [];
      if (state.status) state.status = null;
    }

    // ---------- 2. Restart / cancel ----------
    if (!plan.next && u.intent === 'restart') { state.data = data = freshData(); state.stage = 'collecting'; state.queryMode = null; state.status = null; state.leadId = null; state.lastAsked = null; resetFlow(); plan.notes.push('restarted'); }
    if (!plan.next && u.intent === 'cancel' && !state.status) {
      const had = hasApp() ? JSON.parse(JSON.stringify(data)) : null; const wasLead = state.stage === 'submitted' ? state.leadId : null;
      state.data = data = freshData(); state.stage = 'collecting'; state.queryMode = null; state.lastAsked = null; resetFlow(); state.appStarted = false;
      plan.next = { type: 'cancelled', country: (had && had.country) || '', visaType: (had && had.visaType) || '' };
      // Adhuri application aur wajah team/sales ke liye record ("Lost"), mitti mein nahi
      if (had) {
        const list = pickQuestions(cfg, had).filter(q => has(had[q.field])).map(q => `${q.label}: ${had[q.field]}`).join('; ');
        query = { QueryID: uid('L'), CreatedAt: nowIso, Type: 'LOST', Question: (`Customer cancelled${wasLead ? ' lead ' + wasLead : ''}: "${msg.slice(0, 300)}" | ${list}`).slice(0, 1000),
          Country: had.country || '', VisaType: had.visaType || '', FullName: had.fullName || '', WhatsApp: had.whatsapp || '', AssignedAgent: pickAgent(had.country).name, Status: 'Lost', SessionID: ctx.sessionId };
        sideEffect = 'query';
      }
    }

    // ---------- 3. Status mode ----------
    if (!plan.next && u.intent === 'status' && !state.status) state.status = { leadId: null, whatsapp: null, attempts: 0, asks: 0 };
    if (!plan.next && state.status) {
      const movingOn = u.intent !== 'status' && (u.intent === 'apply' || u.intent === 'cancel' || u.updates.some(x => ['country', 'visaType'].includes(x.field)));
      if (movingOn) { state.status = null; plan.notes.push('left_status_mode'); if (u.intent === 'cancel') plan.next = { type: 'cancelled' }; }
      else {
        const st = state.status;
        const idInText = msg.match(/\bAEG-[A-Z0-9]{4,}\b/i);
        if (u.status_lead_id) st.leadId = String(u.status_lead_id).trim().toUpperCase(); else if (idInText) st.leadId = idInText[0].toUpperCase();
        const waRaw = u.status_whatsapp || (u.updates.find(x => x.field === 'whatsapp') || {}).value || (/^[\s+\d()-]{10,20}$/.test(toAsciiDigits(msg)) ? msg : null);
        if (waRaw) { const p = normPhone(waRaw); if (p) st.whatsapp = p; else plan.issues.push({ field: 'whatsapp', label: 'WhatsApp', reason: 'invalid_phone' }); }
        u.updates = [];
        if (st.leadId && st.whatsapp) {
          if ((st.attempts || 0) >= 4) { state.status = null; plan.next = { type: 'status_locked' }; }
          else { st.attempts = (st.attempts || 0) + 1; sideEffect = 'status'; statusQuery = { leadId: st.leadId, whatsapp: st.whatsapp }; plan.next = { type: 'status_pending' }; }
        } else {
          st.asks = (st.asks || 0) + 1;
          // 4 dafa maangne par bhi details na milein to status mode se nikal jao (loop nahi)
          if (st.asks > 4) { state.status = null; plan.next = { type: 'status_locked' }; }
          else plan.next = { type: 'status_ask', need: [!st.leadId && 'reference_id', !st.whatsapp && 'whatsapp'].filter(Boolean), attempt: st.asks };
        }
      }
    }

    // ---------- 4. Submitted ke baad ----------
    if (!plan.next && state.stage === 'submitted') {
      const newApp = u.intent === 'apply' || u.updates.some(x => ['country', 'visaType'].includes(x.field));
      if (newApp) { state.data = data = freshData(); state.stage = 'collecting'; state.leadId = null; resetFlow(); plan.notes.push('new_application'); }
      else if (u.updates.length && !['question', 'greeting', 'smalltalk'].includes(u.intent)) {
        state.queryMode = { type: 'UPDATE_AFTER_SUBMIT', question: `Customer wants to update submitted lead ${state.leadId}: ${msg}` };
        u.updates = u.updates.filter(x => ['fullName', 'whatsapp'].includes(x.field) && !has(data[x.field]));
      }
    }

    // ---------- 5. Human se baat (30 minute mein ek hi request team ko jati hai) ----------
    if (!plan.next && u.intent === 'human' && !state.queryMode) {
      const recentHuman = state.lastHumanQueryAt && (Date.now() - Date.parse(state.lastHumanQueryAt)) < 30 * 60 * 1000;
      if (recentHuman) plan.next = { type: 'human_already' };
      else state.queryMode = { type: 'HUMAN', question: (u.question || msg) + (state.lastLead ? ` (about application ${state.lastLead.leadId}, status ${state.lastLead.status})` : '') };
    }

    // ---------- 6. Updates validate karke save karna ----------
    if (!plan.next || !['cancelled', 'throttled', 'feedback_thanks'].includes(plan.next.type)) {
      // Safety net: AI pichhle sawal ka seedha jawab miss kar de to code khud pakar le
      if (aiOk && !synthetic && state.lastAsked && !state.status && msg.length <= 40 && !u.updates.some(x => x.field === state.lastAsked)) {
        const d0 = fieldDefFor(cfg, data, state.lastAsked);
        if (d0 && ((['choice', 'number', 'phone'].includes(d0.type) && validateField(cfg, data, d0, msg).ok) || (d0.type === 'date' && findDateExpr(msg)))) {
          u.updates.push({ field: state.lastAsked, value: msg });
          if (!/[?\u061F]/.test(msg) && !/\b(why|kyun|kiyun|kyu|kiu|q|kya|kia|what|how|kaise)\b/i.test(msg)) plan.question = null;
        }
      }
      // Number dohraya tha: "haan" = theek; "nahi/galat" = dobara poochna; naya number = normal update
      if (pendingPhone && has(data[pendingPhone])) {
        const nm = norm(msg);
        if (!u.updates.some(x => x.field === pendingPhone) && (NO_RE.test(nm) || /^(galat|ghalat|wrong|ye nahi|yeh nahi|nahi ye|nahi yeh|no wrong)\b/.test(nm))) { delete data[pendingPhone]; plan.notes.push('phone_rejected'); plan.phoneRejected = true; }
        else if (YES_RE.test(nm) || /^(ok|okay|theek|theek hai|thik hai|sahi|sahi hai|correct|right|done|ji sahi|haan sahi|yes correct)$/.test(nm)) { plan.notes.push('phone_confirmed'); u.updates = u.updates.filter(x => x.field !== pendingPhone); }
      }
      // Customer ne guzri hui date di thi, hum ne agle saal ki suggest ki: "haan / ji / ok / wohi" = suggest ki hui date
      if (pendingDate && (YES_RE.test(norm(msg)) || /^(ok|okay|ok ji|theek|theek hai|thik|thik hai|sahi|sahi hai|correct|right|done|wohi|wahi|ji wahi|haan wahi|haan ji|yes please)$/.test(norm(msg)))) {
        u.updates = u.updates.filter(x => x.field !== pendingDate.field && !YES_RE.test(norm(x.value))).concat([{ field: pendingDate.field, value: pendingDate.value }]);
        if (u.intent !== 'apply') u.intent = 'providing_info';
        plan.question = null;
      }
      // Suggestion ke jawab mein sirf saal: "2026" / "2027 mein" / "agle saal" -> wahi din-mahina us saal ka
      else if (pendingDate && !findDateExpr(msg)) {
        const ym = toAsciiDigits(msg).match(/(?<!\d)(20\d{2})(?!\d)/);
        const nextYr = /(next year|agle saal|aglay saal|agle sal|اگلے سال)/i.test(msg);
        if (ym || nextYr) {
          const pv = String(pendingDate.value), iso = pv.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          const yr = ym ? ym[1] : (iso ? iso[1] : pv.slice(-4));
          const val = iso ? `${+iso[3]} ${TD_NAMES[+iso[2] - 1]} ${yr}` : pv.replace(/\d{4}$/, yr);
          u.updates = u.updates.filter(x => x.field !== pendingDate.field).concat([{ field: pendingDate.field, value: val }]);
          if (u.intent !== 'apply') u.intent = 'providing_info';
          plan.question = null;
        }
        // V18.8: "nahi" = jo date hum ne confirm karni chahi woh ghalat: sahi date maango (dobara wohi sawal nahi)
        else if (NO_RE.test(norm(msg)) || /^(galat|ghalat|wrong|ye nahi|yeh nahi|nahi ye|nahi yeh|not this|no not)\b/.test(norm(msg))) {
          u.updates = u.updates.filter(x => x.field !== pendingDate.field);
          const pd = fieldDefFor(cfg, data, pendingDate.field) || {};
          plan.issues.push({ field: pendingDate.field, label: pd.label || 'Travel date', reason: 'date_rejected', detail: '', given: '', soft: true });
          plan.question = null;
        }
      }
      if (!has(data.visaType) && !state.status && !u.updates.some(x => x.field === 'visaType')) {
        const p = purposeFromText(msg, state.lastAsked === 'visaType');
        if (p) u.updates.push({ field: 'visaType', value: p });
      }
      const rank = f => f === 'country' ? 0 : f === 'visaType' ? 1 : 2;
      // V19.1: "Karachi se safar karunga" poora jumla kisi field ka jawab nahi (AI ne pichle sawal mein daal diya ho tab bhi)
      if (msgFacts.departure) u.updates = u.updates.filter(x => !x || x.field === 'departureCity' || norm(x.value) !== norm(msg));
      const ups = u.updates.filter(x => x && x.field && has(x.value)).sort((a, b) => rank(a.field) - rank(b.field));
      for (const up of ups) {
        const def = fieldDefFor(cfg, data, String(up.field).trim()); if (!def) continue;
        // Date: AI ne format badla ho (2026-05-18 / "May 2026") to customer ke asal alfaaz se saal khud tay karo
        let yearFixed = false;
        if (def.type === 'date' && !(pendingDate && up.value === pendingDate.value)) {
          const av = String(up.value).trim();
          const years = [...toAsciiDigits(msg).matchAll(/(?<!\d)(20\d{2})(?!\d)/g)].map(x => x[1]);
          const isCorrection = /(nahi|nahin|nhi|nh|not|instead|balke|bulke|actually|actully|actualy|sorry|galat|ghalat|ghalti)/i.test(msg);
          const yearOnly = /^20\d{2}$/.test(av) || (!findDateExpr(msg) && years.length === 1 && /^\s*\D{0,30}20\d{2}\D{0,30}$/.test(toAsciiDigits(msg)));
          if (yearOnly || (isCorrection && new Set(years).size >= 2)) {
            const yr = /^20\d{2}$/.test(av) ? av : years[years.length - 1];
            const me = findDateExpr(msg), stored = String(data[def.field] || ''), si = stored.match(/^(\d{4})-(\d{2})-(\d{2})$/), sm = stored.match(/^([A-Za-z]+) \d{4}$/);
            let val = '';
            if (me && me.kind === 'day') val = `${me.d} ${TD_NAMES[me.mo - 1]} ${yr}`;
            else if (me && me.kind === 'month') val = `${TD_NAMES[me.mo - 1]} ${yr}`;
            else if (si) val = `${+si[3]} ${TD_NAMES[+si[2] - 1]} ${yr}`;
            else if (sm) val = `${sm[1]} ${yr}`;
            if (val) { up.value = val; yearFixed = true; }
          }
          if (!yearFixed && findDateExpr(msg) && (!findDateExpr(av) || /^\d{4}-\d{2}-\d{2}$/.test(av) || /^[A-Za-z]+ \d{4}$/.test(av))) up.value = msg;
        }
        // V19.1: "ghoomne" / "sair" jaise purpose list ke naam par (Tourist), customer ke apne alfaaz par naya type nahi
        if (def.type === 'visatype' && !resolveVisa(cfg, up.value, data.country)) { const pv = purposeFromText(up.value, true); if (pv) up.value = pv; }
        // Purpose sirf tab jab customer ne bataya ho (AI ka "Tourist" andaza nahi)
        if (def.type === 'visatype' && prevAsked !== def.field && !synthetic && !containsTerm(msg, up.value) && !purposeFromText(msg, false)) { plan.notes.push('visa_guess_dropped'); continue; }
        // Duration mein date = wapsi ki date
        if (def.type === 'duration') {
          const src = findDateExpr(up.value) ? String(up.value) : (findDateExpr(msg) ? msg : '');
          if (src && !DUR_WORDS.test(src)) {
            const rd = returnDateInfo(src, data.travelDate);
            if (rd && !rd.ok) { plan.issues.push({ field: def.field, label: def.label, reason: rd.reason, detail: rd.detail || '', given: String(src).slice(0, 60) }); continue; }
            if (rd && rd.ok) { up.value = rd.value; plan.durationFromReturn = rd.label; }
          }
        }
        let r = validateField(cfg, data, def, up.value);
        if (def.type === 'country') {
          // V19.1: "Karachi se" / Pakistan = jahan se ja rahe hain, manzil nahi
          if (PK_CITIES.includes(norm(up.value)) || (msgFacts.departure && norm(up.value) === norm(msgFacts.departure))) { plan.notes.push('departure_not_destination'); continue; }
          const cv = countryVerdict(up.value); if (cv) r = cv;
          // Mana wali country sirf tab jab customer ne ISI message mein likhi ho (AI purani chat se na uthaye)
          if (!r.ok && r.reason === 'blocked_country' && !blockedInMessage(msg) && !containsTerm(msg, up.value)) { plan.notes.push('blocked_from_history_ignored'); continue; }
        }
        // Sirf ek lafz ka naam: ek dafa surname poochna, dobara wahi aaye to qabool
        // V19: AskNameFirst par sirf pehla naam bhi qabool ("Jamal"), jab tak RequireFullName = yes na ho
        const wantSurname = yes(S.RequireFullName) || !yes(S.AskNameFirst);
        if (r.ok && def.type === 'name' && wantSurname && r.value.split(/\s+/).length === 1 && !(state.singleNameAsks >= 1) && prevAsked === def.field) {
          state.singleNameAsks = 1; plan.issues.push({ field: def.field, label: def.label, reason: 'single_name', detail: '', given: r.value }); continue;
        }
        // V18.8: saal nahi bataya aur date agle saal ki banti hai ("18 aug" -> 18 August 2027): pehle customer se confirm karo
        if (r.ok && def.type === 'date' && r.rolled && !(pendingDate && up.value === pendingDate.value)) {
          const yv = (String(r.value).match(/(20\d{2})/) || [])[1];
          if (yv && +yv > +String(pkToday()).slice(0, 4)) {
            state.pendingDate = { field: def.field, value: r.value };
            plan.issues.push({ field: def.field, label: def.label, reason: 'date_confirm_year', detail: friendlyDate(r.value), given: String(up.value).slice(0, 60), soft: true });
            continue;
          }
        }
        if (r.ok) {
          const countryChanged = def.field === 'country' && has(data.country) && data.country !== r.value;
          if (data[def.field] !== r.value) {
            data[def.field] = r.value; plan.saved.push({ field: def.field, label: def.label, value: r.value });
            if (def.type === 'date' && !(pendingDate && up.value === pendingDate.value)) plan.dateSaved = { label: def.label, value: friendlyDate(r.value), rolled: !!r.rolled }; // V18.8: customer ne "haan" kaha to date dobara nahi dohrani
          }
          if (countryChanged && has(data.visaType)) { const vt = resolveVisa(cfg, data.visaType, data.country); if (!vt || vt.action !== 'Apply') { delete data.visaType; plan.notes.push('visa_type_cleared_for_new_country'); } }
        } else if (r.reason === 'unsupported_country') {
          plan.unsupportedCountry = { asked: r.detail, supportedCountries: activeCountries(cfg) };
        } else if (r.reason === 'blocked_country') {
          plan.blockedCountry = { name: r.detail };
        } else if (r.reason === 'refused_visa_type') {
          state.refusedAsked = state.refusedAsked || {}; const rk = norm(r.detail); state.refusedAsked[rk] = (state.refusedAsked[rk] || 0) + 1;
          plan.refusedVisa = { asked: r.detail, businessNote: r.note, supportedTypes: supportedVisaNames(cfg, data.country), unknown: !!r.unknown, repeat: state.refusedAsked[rk] >= 2 };
        } else if (r.reason === 'forward_visa_type') {
          plan.forwardVisa = { asked: r.detail, businessNote: r.note };
          state.queryMode = { type: 'VISA_TYPE', question: `${r.detail} visa inquiry${data.country ? ' for ' + data.country : ''}: ${msg}` };
        } else {
          if (def.type === 'date' && r.suggestion) state.pendingDate = { field: def.field, value: r.suggestion };
          plan.issues.push({ field: def.field, label: def.label, reason: r.reason, detail: r.detail || '', given: String(up.value).slice(0, 60) });
        }
      }
      // V19: "main, biwi aur 2 bache" se relationship bhi khud bhar do (dobara poochne ki zaroorat nahi)
      if (plan.saved.some(x => x.field === 'travellers') && !has(data.relationship)) {
        const pt = parseTravellers(msg); const rd = fieldDefFor(cfg, data, 'relationship');
        if (pt && pt.relation && pt.relation !== 'alone' && pt.count > 1 && rd && rd.field === 'relationship') { data.relationship = pt.relation; plan.saved.push({ field: 'relationship', label: rd.label || 'Relationship', value: pt.relation }); }
      }
      // Backup: AI ne country miss ki ho to message mein country/city ka naam dhoondo
      if (!plan.next && !has(data.country) && !plan.unsupportedCountry && !ups.some(x => x.field === 'country')) {
        const hit = cfg.countries.find(c => c.active && !PK_CITIES.includes(norm(c.name)) && [c.name, ...c.aliases, ...c.cities].some(t => containsTerm(msg, t) && !(msgFacts.departure && norm(t) === norm(msgFacts.departure))));
        if (hit) { data.country = hit.name; plan.saved.push({ field: 'country', label: (fieldDefFor(cfg, data, 'country') || {}).label || 'Country', value: hit.name }); }
      }
    }
    // Backup 2: message mein mana wali country (France / USA / Israel) ka zikar
    const askingAbout = ['question', 'ask_countries', 'other'].includes(u.intent) || /[?\u061F]/.test(msg) || /\b(kya|kia|karte|krte|hota|hoti|do you|can you|process)\b/i.test(msg);
    if (!plan.next && !plan.blockedCountry && !plan.saved.some(s => s.field === 'country') && (!has(data.country) || askingAbout)) { const bm = blockedInMessage(msg); if (bm) plan.blockedCountry = { name: bm }; }
    if (plan.saved.length) state.confirmReminders = 0;
    if (u.intent === 'apply' || u.intent === 'restart' || (appStartedBefore && plan.saved.length) || (u.intent === 'providing_info' && plan.saved.some(s => s.field !== 'country'))) state.appStarted = true;

    // ---------- 6b. Mana wali country, ya "aap kon kon si countries karte ho" ----------
    if (!plan.next && plan.blockedCountry) {
      plan.next = { type: 'blocked_country', country: plan.blockedCountry.name }; plan.question = null;
      // Application chal rahi thi (jaise UAE): mana wali country ka jawab de kar wahin se aage barho, baat khatam na karo
      if (state.stage === 'collecting' && !state.status && !state.queryMode) {
        if (has(data.country) && hasApp()) {
          const nf = nextFieldPlan(false);
          if (nf) { nf.attempt = Math.max(1, (prevAsked === nf.field && state.askCount[nf.field]) || 1); plan.resume = nf; plan.resumeCountry = data.country || ''; }
        } else if (state.appStarted || u.intent === 'apply' || has(data.visaType)) {
          // Koi jaiz country nahi: "application jari" nahi, seedha poochna kis aur mulk ka plan hai
          const cd = fieldDefFor(cfg, data, 'country') || {};
          plan.resume = { type: 'ask_field', field: 'country', label: cd.label || 'Country', ask: cd.ask || '', fieldType: 'country', options: [], attempt: 1, otherCountry: true };
        }
      }
    }
    if (!plan.next && !plan.saved.some(s => s.field === 'country') && (u.intent === 'ask_countries' || COUNTRY_LIST_RE.test(msg))) { plan.next = { type: 'country_list' }; plan.question = null; }

    // ---------- 6c. V19: Jo hum process nahi karte (mana wali country / Refuse visa type): demand ki lead ----------
    // Customer ka naam + WhatsApp le kar lead (status "Not processed") banti hai, taake business ko pata chale kya demand aa rahi hai.
    // Phir customer ko helpline ka bata diya jata hai. Customer na dena chahe to zabardasti nahi.
    // V19.2: setting khali / na ho to bhi ON (default). Sirf "no" likhne par band
    const captureRefused = !/^(no|false|0|off)$/i.test(String(S.CaptureRefusedLeads ?? '').trim());
    const wasRefused = state.refused || null;
    if (!captureRefused) state.refused = null;
    else if (wasRefused) {
      const movedOn = plan.saved.some(x => x.field === 'country' || (x.field === 'visaType' && wasRefused.kind === 'visa'))
        || ['cancel', 'restart', 'status', 'human'].includes(u.intent) || !!state.status;
      const nmsg0 = norm(msg);
      const gaveContact = plan.saved.some(x => ['fullName', 'whatsapp'].includes(x.field));
      const contactIssueOnly = !plan.issues.some(i => !['fullName', 'whatsapp'].includes(i.field));
      if (movedOn) { state.refused = null; plan.notes.push('refused_left'); }
      else if (!gaveContact && contactIssueOnly && (NO_RE.test(nmsg0) || isClosing(msg) || /(^| )(nahi dena|nahi batana|nhi dena|no thanks|skip|rehne do|chhoro|chodo|not interested|dont want|don t want)( |$)/.test(nmsg0))) {
        plan.issues = []; state.refused = null; state.lastAsked = null; plan.next = { type: 'refused_dropped', kind: wasRefused.kind, country: wasRefused.country, visaType: wasRefused.visaType }; plan.question = null;
      }
    }
    if (captureRefused && !state.refused && !state.status) {
      // Naya refused case: mana wali country (koi aur application na chal rahi ho) ya Refuse wala visa type
      const blockedNow = plan.next && plan.next.type === 'blocked_country' && !(plan.resume && !plan.resume.otherCountry) && !plan.saved.some(x => x.field === 'country');
      if (blockedNow && state.stage !== 'collecting') { state.stage = 'collecting'; state.leadId = null; } // submit ke baad nayi (mana wali) demand
      if (blockedNow) state.refused = { kind: 'country', country: plan.next.country || (plan.blockedCountry || {}).name || '', visaType: has(data.visaType) ? data.visaType : '', msg: msg.slice(0, 300), at: nowIso, asks: 0, prefix: true };
      else if (plan.refusedVisa && !plan.next) state.refused = { kind: 'visa', country: data.country || '', visaType: plan.refusedVisa.asked, note: plan.refusedVisa.businessNote || '', supported: plan.refusedVisa.supportedTypes || [], msg: msg.slice(0, 300), at: nowIso, asks: 0 };
      else if (plan.next && plan.next.type === 'blocked_country' && plan.resume && !plan.resume.otherCountry) {
        // Application chal rahi hai: usi ko jari rakho, lekin demand lead ki details mein note ho jaye
        const note = `Also asked about ${plan.next.country} visa (not processed)`;
        if (!state.openQuestions.includes(note)) state.openQuestions = state.openQuestions.concat([note]).slice(-5);
      }
      if (state.refused) { plan.refusedStart = true; plan.question = null; plan.resume = null; } // V19.4: "kis aur mulk" wala resume nahi, pehle naam
    }
    if (state.refused && !(plan.next && plan.next.type === 'refused_dropped')) {
      const rf = state.refused;
      if (plan.refusedStart && rf.kind === 'country') plan.refusedPrefix = { country: rf.country };
      const need = ['fullName', 'whatsapp'].filter(f => !has(data[f]));
      if (!need.length) {
        // Details mil gayi: lead banao (workflow.service), phir helpline ka bata do
        const summ = rf.kind === 'country' ? `${rf.country} visa${rf.visaType ? ' (' + rf.visaType + ')' : ''}` : `${rf.visaType} visa${rf.country ? ' for ' + rf.country : ''}`;
        lead = { LeadID: 'AEG-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 5).toUpperCase(), CreatedAt: nowIso,
          Status: String(S.RefusedLeadStatus || 'Not processed').trim() || 'Not processed', AssignedAgent: 'Unassigned',
          FullName: String(data.fullName || ''), WhatsApp: String(data.whatsapp || ''), Country: rf.country || '', VisaType: rf.visaType || '', TravelDate: String(data.travelDate || ''), Duration: String(data.duration || ''),
          Travellers: String(data.travellers || ''), Relationship: String(data.relationship || ''), BankStatement: '', CityToStay: '',
          OtherDetails: `Not processed (${rf.kind === 'country' ? 'country not served' : 'visa type not served'}): customer was referred to the helpline`,
          OpenQuestions: state.openQuestions.join(' | '), Summary: `Demand: ${summ}. Customer said: "${rf.msg}"`, Language: state.language, SessionID: ctx.sessionId, LastUpdated: nowIso };
        sideEffect = 'refused_lead'; state.refused = null; state.lastAsked = null;
        plan.next = { type: 'refused_pending', kind: rf.kind, country: rf.country, visaType: rf.visaType };
        plan.question = null;
      } else {
        const f = need[0];
        const prevCount = (prevAsked === f && !plan.saved.some(x => x.field === f)) ? (rf.asks || 0) : 0;
        if (prevCount >= 2) {
          // Do dafa poochne par bhi na diya: baat narmi se samet do
          state.refused = null; state.lastAsked = null;
          plan.next = { type: 'refused_dropped', kind: rf.kind, country: rf.country, visaType: rf.visaType };
        } else {
          const d = fieldDefFor(cfg, data, f) || {};
          rf.asks = prevCount + 1;
          plan.next = { type: 'refused_ask', field: f, label: d.label || f, ask: d.ask || '', kind: rf.kind, country: rf.country, visaType: rf.visaType, note: rf.note || '', supported: rf.supported || [], first: !!plan.refusedStart, attempt: rf.asks };
        }
      }
    }

    // ---------- 7. Jawab na mil sakne wale sawal: contact mil jaye to team ko bhejo ----------
    if (!plan.next && !state.queryMode && sideEffect === 'none' && state.openQuestions.length && has(data.fullName) && has(data.whatsapp) && state.stage !== 'confirming' && !hasApp()) {
      state.queryMode = { type: 'UNANSWERED', question: state.openQuestions.join(' | ') }; state.openQuestions = [];
    }

    // ---------- 8. Welcome (sirf ek dafa) ----------
    const nothingNew = !plan.saved.length && !plan.issues.length && !plan.unsupportedCountry && !plan.refusedVisa && !plan.forwardVisa;
    if (!plan.next && nothingNew && !plan.question && ['greeting', 'smalltalk'].includes(u.intent) && !hasApp() && state.stage === 'collecting' && !state.queryMode) {
      if (!state.welcomed) { plan.next = { type: 'welcome', askName: yes(S.AskNameFirst) && !has(data.fullName) }; state.welcomed = true; }
      else plan.next = { type: 'help', greeted: true };
    }

    // ---------- 8b. Mana wala visa type dobara: israr par baat narmi se samet do, sawal nahi ----------
    if (!plan.next && plan.refusedVisa && plan.refusedVisa.repeat) { plan.next = { type: 'refused_final', visa: plan.refusedVisa.asked }; plan.question = null; }
    // ---------- 8c. WhatsApp number mila: parhne layak shakal mein dohra kar confirm ----------
    const phoneSaved = plan.saved.find(s => ((fieldDefFor(cfg, data, s.field) || {}).type === 'phone'));
    if (!plan.next && phoneSaved && state.stage === 'collecting' && !state.queryMode && !state.status && !state.refused) { state.pendingPhone = phoneSaved.field; plan.next = { type: 'confirm_phone', number: prettyPhone(phoneSaved.value) }; }

    // ---------- 9. Confirm stage ----------
    if (!plan.next && state.stage === 'confirming') {
      const missingNow = nextFieldPlan(false);
      if (missingNow) state.stage = 'collecting';
      else if (u.confirm === 'yes' && !plan.saved.length && !plan.issues.length) sideEffect = 'submit';
      else if (plan.saved.length) { state.confirmReminders = 0; plan.next = { type: 'confirm_summary', changed: true }; }
      else if (u.confirm === 'edit' || u.confirm === 'no') plan.next = { type: 'ask_edit' };
      else if (!state.queryMode) {
        state.confirmReminders = (state.confirmReminders || 0) + 1;
        // Poori list baar baar nahi: pehli reminder ke baad sirf chhota sa "Confirm likhein"
        plan.next = { type: 'confirm_summary', reminder: true, short: state.confirmReminders >= 2 || !!plan.question };
      }
    }

    // ---------- 10. Agla sawal ----------
    if (!plan.next && sideEffect === 'none' && state.stage === 'collecting') {
      // Sirf sawal poocha (chahe us mein "UAE" aaya ho): jawab + halki offer, form shuru nahi
      const soft = !appStartedBefore && !state.appStarted && ['question', 'smalltalk', 'greeting', 'other'].includes(u.intent);
      const nf = nextFieldPlan(soft);
      if (nf) {
        if (state.queryMode) plan.resume = nf; // query pehle, application baad mein wahin se
        else if (soft && state.lastSoftTurn && (state.turns - state.lastSoftTurn) < 3) plan.next = { type: plan.question ? 'answer_only' : 'help', field: nf.field, label: nf.label }; // har message par "apply karein?" nahi
        else if (soft) { plan.next = { type: 'offer_apply', field: nf.field, label: nf.label }; state.lastSoftTurn = state.turns; } // naam/number nahi, sirf halki si offer
        else plan.next = nf;
      } else if (!state.queryMode) { state.stage = 'confirming'; state.confirmReminders = 0; plan.next = { type: 'confirm_summary' }; }
    }

    // ---------- 11. Team ko query bhejni ho ----------
    if (state.queryMode && sideEffect === 'none' && (!plan.next || !['cancelled', 'throttled', 'feedback_thanks', 'status_pending', 'status_ask', 'status_locked', 'blocked_country', 'country_list', 'refused_ask', 'refused_pending', 'refused_dropped'].includes(plan.next.type))) {
      if (has(data.fullName) && has(data.whatsapp)) {
        const agent = pickAgent(data.country);
        query = { QueryID: uid('Q'), CreatedAt: nowIso, Type: state.queryMode.type, Question: String(state.queryMode.question).slice(0, 1000),
          Country: data.country || '', VisaType: data.visaType || '', FullName: data.fullName, WhatsApp: data.whatsapp, AssignedAgent: agent.name, Status: 'Open', SessionID: ctx.sessionId };
        if (state.queryMode.type === 'HUMAN') state.lastHumanQueryAt = nowIso;
        sideEffect = 'query'; plan.next = { type: 'query_pending', queryType: state.queryMode.type };
        if (!plan.resume && state.stage === 'collecting' && hasApp()) plan.resume = nextFieldPlan(false);
        if (query.Type === 'HUMAN') plan.resume = null; // V19.2: insaan se baat maangi hai: saath mein form ka sawal nahi
        state.queryMode = null;
      } else {
        const need = ['fullName', 'whatsapp'].filter(f => !has(data[f]));
        const f = need[0];
        const prevCount = prevAsked === f ? (state.askCount[f] || 0) : 0;
        if (prevCount >= 3) {
          // Customer contact nahi dena chahta: zabardasti nahi, sawal yaad rakh lo aur aage barho
          state.openQuestions = state.openQuestions.concat([String(state.queryMode.question).slice(0, 300)]).slice(-5);
          state.queryMode = null; state.lastAsked = null; plan.resume = null;
          plan.next = { type: 'query_dropped' };
        } else {
          const d = fieldDefFor(cfg, data, f) || {};
          plan.next = { type: 'ask_contact_for_query', queryType: state.queryMode.type, need, label: d.label || f, ask: d.ask || f, attempt: prevCount + 1 };
          plan.resume = null;
        }
      }
    }

    // ---------- 11b. Submit ke baad baat cheet ----------
    if (!plan.next && sideEffect === 'none' && state.stage === 'submitted') {
      plan.next = { type: 'after_submit', referenceId: state.leadId, repeat: (state.afterSubmitReplies || 0) >= 1 };
      state.afterSubmitReplies = (state.afterSubmitReplies || 0) + 1;
    }

    // ---------- V18.8: samajh na aaye to dostana tareeqe se poochna ----------
    const nmsg = norm(msg);
    if (pendingClarify && !ctx.clarifiedFrom && !plan.saved.length && (NO_RE.test(nmsg) || /^(galat|ghalat|wrong|ye nahi|yeh nahi|nahi ye|nahi yeh|not that|no not)\b/.test(nmsg))) plan.clarifyRejected = true;
    else if (aiOk && !synthetic && !ctx.clarifiedFrom && u.unclear && has(u.meaning_guess) && !plan.saved.length && !plan.issues.length && !plan.question && !plan.identityAsk
      && plan.next && ['ask_field', 'help', 'offer_apply', 'answer_only', 'confirm_summary', 'after_submit'].includes(plan.next.type)) {
      plan.clarify = String(u.meaning_guess).trim().slice(0, 200); state.pendingClarify = plan.clarify;
    }
    if ((plan.clarify || plan.clarifyRejected) && plan.next && plan.next.type === 'ask_field') plan.next.attempt = Math.max(1, prevAsked === plan.next.field ? (state.askCount[plan.next.field] || 1) : 1);

    // ---------- Ginti update (repeat / loop control) ----------
    if (plan.next && plan.next.type === 'ask_field') { state.lastAsked = plan.next.field; state.askCount = { [plan.next.field]: plan.next.soft ? 0 : plan.next.attempt }; }
    else if (plan.next && plan.next.type === 'ask_contact_for_query') { const f = plan.next.need[0]; state.lastAsked = f; state.askCount = { [f]: plan.next.attempt }; }
    else if (plan.next && plan.next.type === 'refused_ask') { state.lastAsked = plan.next.field; state.askCount = {}; }
    else if (plan.next && plan.next.type === 'query_pending' && plan.resume) { state.askCount = {}; }
    else if (!(plan.next && ['throttled', 'help'].includes(plan.next.type) && ctx.skipReason)) { state.askCount = {}; }
    if (plan.next && plan.next.type === 'blocked_country' && plan.resume) { state.lastAsked = plan.resume.field; state.askCount = { [plan.resume.field]: plan.resume.attempt }; }
    else if (plan.next && ['refused_final', 'refused_pending', 'refused_dropped', 'confirm_phone', 'confirm_summary', 'welcome', 'cancelled', 'status_ask', 'status_pending', 'status_locked', 'after_submit', 'feedback_thanks', 'query_dropped', 'human_already', 'goodbye', 'offer_apply', 'help', 'answer_only'].includes(plan.next.type)) state.lastAsked = null;

    // V19: welcome ne naam poocha tha: agla seedha jawab ("Jamal") naam samjha jaye
    if (plan.next && plan.next.type === 'welcome' && plan.next.askName) { state.lastAsked = 'fullName'; state.askCount = { fullName: 1 }; }

    // ---------- 12. Lead tayyar karna ----------
    if (sideEffect === 'submit') {
      const agent = pickAgent(data.country);
      const list = summaryList();
      const CORE_COLS = { fullName: 'FullName', whatsapp: 'WhatsApp', country: 'Country', visaType: 'VisaType', travelDate: 'TravelDate', duration: 'Duration', travellers: 'Travellers', relationship: 'Relationship', bankStatement: 'BankStatement', cityToStay: 'CityToStay' };
      const leadId = 'AEG-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 5).toUpperCase();
      lead = { LeadID: leadId, CreatedAt: nowIso, Status: 'New', AssignedAgent: agent.name || 'Unassigned', FullName: '', WhatsApp: '', Country: '', VisaType: '', TravelDate: '', Duration: '', Travellers: '', Relationship: '', BankStatement: '', CityToStay: '',
        OtherDetails: list.filter(x => !CORE_COLS[x.field]).map(x => `${x.label}: ${x.value}`).join('; '), OpenQuestions: state.openQuestions.join(' | '),
        Summary: list.map(x => `${x.label}: ${x.value}`).join('; '), Language: state.language, SessionID: ctx.sessionId, LastUpdated: nowIso };
      for (const [f, col] of Object.entries(CORE_COLS)) lead[col] = String(data[f] || '');
      const rowsHtml = list.map(x => `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:bold;">${esc(x.label)}</td><td style="padding:6px 10px;border:1px solid #ddd;">${esc(x.value)}</td></tr>`).join('');
      email = { to: agent.email || S.FallbackAgentEmail || '', subject: `New visa lead ${leadId}: ${data.country || ''} ${data.visaType || ''} - ${data.fullName || ''}`.slice(0, 200),
        html: `<div style="font-family:Arial,sans-serif;"><h3 style="color:#1F4E78;">New visa lead ${esc(leadId)}</h3><table style="border-collapse:collapse;">${rowsHtml}</table>${lead.OpenQuestions ? `<p><b>Customer ke sawal jin ka jawab team ko dena hai:</b> ${esc(lead.OpenQuestions)}</p>` : ''}<p>Customer language: ${esc(state.language)}</p><p style="color:#666;">Assigned to: ${esc(lead.AssignedAgent)}</p></div>` };
      plan.next = { type: 'submit_pending' };
    }

    // ---------- 13. Knowledge: sirf sawal se milti julti rows (tokens bachte hain) ----------
    const STOP = new Set(['the', 'and', 'for', 'what', 'how', 'does', 'need', 'visa', 'with', 'from', 'that', 'this', 'are', 'can', 'you', 'have', 'your', 'kya', 'hai', 'ke', 'ki', 'liye', 'mujhe']);
    const interest = new Set([norm(data.country), norm(plan.unsupportedCountry && plan.unsupportedCountry.asked)].filter(Boolean));
    for (const c of cfg.countries) if (plan.question && [c.name, ...c.aliases, ...c.cities].some(t => containsTerm(plan.question, t))) interest.add(norm(c.name));
    const qWords = new Set(norm([plan.question, plan.question ? '' : msg].join(' ')).split(' ').filter(w => w.length >= 3 && !STOP.has(w)));
    const overlap = t => { let n = 0; for (const w of new Set(norm(t).split(' '))) if (qWords.has(w)) n++; return n; };
    const kRows = cfg.knowledge.filter(k => (norm(k.country) === 'all' || interest.has(norm(k.country))) && (norm(k.visaType) === 'all' || !has(data.visaType) || norm(k.visaType) === norm(data.visaType)))
      .map(k => ({ k, score: overlap(k.topic) * 4 + overlap(k.info) + (norm(k.country) !== 'all' ? 2 : 0) + (norm(k.visaType) !== 'all' ? 1 : 0) }))
      .sort((a, b) => b.score - a.score);
    let kText = '', budget = Number(S.KnowledgeBudgetChars) || 4500, count = 0;
    for (const { k } of kRows) { const line = `[${k.country}${norm(k.visaType) !== 'all' ? ' / ' + k.visaType : ''}] ${k.topic}: ${k.info}\n`; if (line.length > budget || count >= 10) break; kText += line; budget -= line.length; count++; }
    const blockedList = (cfg.countries || []).filter(c => !c.active).map(c => c.name);
    const facts = [`Countries: we provide visa application assistance for all countries worldwide${blockedList.length ? ', except ' + blockedList.join(', ') + ' visas' : ''}. Never give a list of countries.`,
      `Visa types we process${data.country ? ' for ' + data.country : ''}: ${supportedVisaNames(cfg, data.country).join(', ') || 'see team'}.`,
      refusedVisaNames(cfg, data.country).length ? `Visa types we do NOT process: ${refusedVisaNames(cfg, data.country).join(', ')}.` : ''].filter(Boolean).join('\n');
    const needKnowledge = !!(plan.question || plan.unsupportedCountry || plan.refusedVisa || plan.forwardVisa);
    state.lastQuestion = plan.question || null;

    return [{ json: { sheetId: ctx.sheetId, sessionId: ctx.sessionId, text: msg, originalText: ctx.originalText || msg, t0: ctx.t0, receivedAt: ctx.receivedAt, isNew: ctx.isNew, history: ctx.history,
      state, plan, sideEffect, lead, email, statusQuery, query, summary: summaryList(), knowledgeText: needKnowledge ? facts + '\n' + kText : facts,
      understood: u, aiOk, synthetic, skipReason: ctx.skipReason || null, feedbackRating } }];
  }
};
