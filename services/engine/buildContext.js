/**
 * Engine step: Build Context (ported from n8n node "Build Context", V18.8).
 * Logic bilkul same hai; n8n ke $(), $input aur static data ab
 * workflow.service ka runtime (services/engine/runtime.js) deta hai.
 */
const H = require("./helpers");

module.exports = function buildContext(rt) {
  const { $, $input, $getWorkflowStaticData } = rt;
  const { parseTravellers, toAsciiDigits, norm, has, yes, splitList, titleCase, safeJson, esc, containsTerm, condOk, resolveCountry, visaRows, resolveVisa, supportedVisaNames, refusedVisaNames, activeCountries, pickQuestions, fieldDefFor, relevantFieldDefs, normPhone, prettyPhone, YES_RE, NO_RE, matchChoice, NOT_NAME, TD_MONTHS, TD_NAMES, TD_ALT, TD_AMBIG, tdMonth, tdDays, tdIso, tdYear, NB, friendlyDate, findDateExpr, resolveTravelDate, FLEX_DATE_RE, validateField, detectLang, EN_WORDS, RU_WORDS, latinLangVote, CLOSING_RE, isClosing, scriptOf, langScript, parseRating, pkToday } = H;
  const getCfg = () => rt.cfg;
  {
    const cfg = getCfg();
    const S = cfg.settings || {};
    const msg = $('Extract Message').first().json;
    // Session: agar duplicate rows hon to sabse nayi wali lo
    let rows = []; try { rows = $('Get Session').all().map(i => i.json).filter(r => r && r.SessionID); } catch (e) {}
    rows.sort((a, b) => String(b.UpdatedAt || '').localeCompare(String(a.UpdatedAt || '')));
    const row = rows[0] || {};
    // Taaza session pehle workflow memory se (Sheets slow/fail ho to bhi baat yaad rahe); Sheet sirf backup
    const sdS = $getWorkflowStaticData('global'); const cached = (sdS.sessions || {})[msg.sessionId] || null;
    const useCache = !!(cached && cached.state && (!row.UpdatedAt || String(cached.at || '') >= String(row.UpdatedAt)));
    const fresh = () => ({ data: {}, stage: 'collecting', lastAsked: null, language: '', languageSample: '', openQuestions: [], loggedQuestions: [], leadId: null, queryMode: null, status: null,
      createdAt: new Date().toISOString(), turns: 0, askCount: {}, confirmReminders: 0, welcomed: false, awaitingFeedback: false, feedbackGiven: false,
      msgTimes: [], lastQuestion: null, lastSoftTurn: 0, afterSubmitReplies: 0, lastHumanQueryAt: null });
    const state = Object.assign(fresh(), useCache ? JSON.parse(JSON.stringify(cached.state)) : safeJson(row.State, {}));
    state.data = (state.data && typeof state.data === 'object') ? state.data : {};
    for (const k of ['openQuestions', 'loggedQuestions', 'msgTimes']) if (!Array.isArray(state[k])) state[k] = [];
    if (!state.askCount || typeof state.askCount !== 'object') state.askCount = {};
    const h0 = useCache ? (cached.history || []) : safeJson(row.History, []);
    const history = (Array.isArray(h0) ? h0 : []).slice(-12);
    const isNew = !row.SessionID && !cached;
    let text = String(msg.text || '');
    // V18.8: pichli dafa bot ne poocha tha "kya aapka matlab yeh hai?" aur customer ne "haan" kaha: wohi matlab samjho
    let clarifiedFrom = null;
    if (state.pendingClarify && (YES_RE.test(norm(text)) || /^(ok|okay|ok ji|theek|theek hai|thik hai|sahi|sahi hai|correct|right|exactly|wohi|wahi|ji bilkul|haan ji|haan bilkul|jee bilkul)$/.test(norm(text)))) { clarifiedFrom = text; text = String(state.pendingClarify); }

    // ---------- Spam / flood control ----------
    const now = Date.now();
    state.msgTimes = state.msgTimes.filter(t => now - t < 60000).concat([now]).slice(-30);
    const maxPerMin = Number(S.MaxMsgsPerMinute) || 10;

    // ---------- AI #1 ki zaroorat hai ya nahi? ----------
    // V19.2: "do u talk in english" / "can you..." bhi sawal hai (pehle naam samajh liya jata tha)
    const QUESTION_WORDS = /\b(why|kyun|kiyun|kyu|kiu|kyon|q|kya|kia|what|how|kaise|kesy|kese|kaisy|kitna|kitni|kitne|when|kab|where|kahan|kahaan|fees?|price|cost|kharcha|who|which|english|urdu|talk|speak|bolo|bol sakte|baat kar)\b|^\s*(do|does|did|can|could|will|would|are|is|should|r|may)\b/i;
    const CLOSERS = ['refused_lead_created', 'refused_dropped', 'status_result', 'status_not_found', 'status_locked', 'lead_created', 'duplicate', 'after_submit', 'query_logged', 'query_dropped', 'feedback_thanks', 'human_already', 'help', 'answer_only', 'offer_apply', 'cancelled', 'goodbye', 'welcome', 'blocked_country'];
    let skipReason = null, directUpdate = null;
    if (state.msgTimes.length > maxPerMin) skipReason = 'throttled';
    else if (!text) skipReason = 'empty';
    else if (state.awaitingFeedback && parseRating(text)) skipReason = 'feedback';
    else if (CLOSERS.includes(state.lastNext) && !state.lastAsked && isClosing(text)) skipReason = 'closing'; // "nahi/thanks" ke liye AI ki zaroorat nahi
    else if (state.lastAsked && state.stage === 'collecting' && !state.status && !state.queryMode && !state.pendingClarify && !clarifiedFrom && !(state.pendingDate && state.pendingDate.field !== state.lastAsked) && text.length <= 30 && !/[?\u061F]/.test(text) && !QUESTION_WORDS.test(text)) {
      // Seedha jawab ("2", "haan", "0300 1234567", option number) code khud samajh leta hai: AI call bachti hai
      const def = fieldDefFor(cfg, state.data, state.lastAsked);
      if (def) {
        const words = norm(text).split(' ').filter(Boolean).length;
        let plain = false;
        if (def.type === 'number') plain = /^\s*[\d\u06F0-\u06F9\u0660-\u0669]{1,3}\s*(log|afrad|people|persons?|bande|members?|adults?)?\s*$/i.test(text) || (def.field === 'travellers' && !!parseTravellers(text));
        // V19: naam / country / purpose ka saaf jawab bhi code samajh leta hai (AI call bachti hai, jawab tez)
        else if (def.type === 'name') plain = words <= 5 && validateField(cfg, state.data, def, text).ok;
        else if (def.type === 'country') { const rc = resolveCountry(cfg, text); plain = words <= 3 && !!rc && rc.country.active && [rc.country.name, ...rc.country.aliases, ...rc.country.cities].some(x => norm(x) === norm(text)); }
        else if (def.type === 'visatype') { const rv = resolveVisa(cfg, text, state.data.country); plain = words <= 3 && !!rv && rv.action === 'Apply' && [rv.name, ...rv.aliases].some(x => norm(x) === norm(text)); }
        else if (def.type === 'phone') plain = /^[\s+\d\u06F0-\u06F9\u0660-\u0669()-]{10,20}$/.test(text);
        else if (def.type === 'choice') plain = words <= 3;
        else if (def.type === 'date') plain = words <= 4 && !!findDateExpr(text);
        // Pichli dafa guzri hui date par agle saal ki date suggest hui thi aur customer ne "haan" kaha
        if (def.type === 'date' && state.pendingDate && state.pendingDate.field === def.field && YES_RE.test(norm(text))) { skipReason = 'direct_answer'; directUpdate = { field: def.field, value: state.pendingDate.value }; }
        if (!skipReason && plain && validateField(cfg, state.data, def, text).ok) { skipReason = 'direct_answer'; directUpdate = { field: def.field, value: text }; }
      }
    }

    // ---------- AI #1 (Understand) request ----------
    // Static hissa pehle (Groq prompt caching ke liye), badalne wali cheezen user message mein
    const countriesTxt = cfg.countries.map(c => `- ${c.name}${c.active ? '' : ' (NOT SUPPORTED)'} | also: ${c.aliases.join(', ') || '-'} | cities: ${c.cities.join(', ') || '-'}`).join('\n');
    const vRows = has(state.data.country) ? visaRows(cfg, state.data.country) : cfg.visaTypes;
    const visaTxt = vRows.map(v => `- ${v.name} [${v.country}] action=${v.action} | customer may say: ${v.aliases.join(', ') || '-'}`).join('\n');
    const fields = relevantFieldDefs(cfg, state.data);
    const fieldsTxt = fields.map(f => `- ${f.field} (type=${f.type}${f.options ? '; options=' + f.options : ''}): ${f.ask || f.label}`).join('\n');
    const system = `You are the language-understanding engine of a visa consultancy chat assistant (${S.BusinessName || 'the consultancy'}). You never write customer-facing text. Read the customer's latest message (any language, any spelling, typos, mixed languages) and return JSON only.

    COUNTRIES (map any country/city/alias to the country name exactly as written):
    ${countriesTxt || '- (none configured)'}

    VISA TYPES (map the customer's meaning to one of these names):
    ${visaTxt || '- (none configured)'}

    FIELDS you can fill (exact field names):
    ${fieldsTxt}

    EXTRACTION RULES
    1. Put every fact from latest_message into "updates" as {field, value}. Several facts -> several updates. Facts given before being asked are welcome. Take facts ONLY from latest_message; recent_chat is context for understanding, never re-extract older facts (e.g. a country mentioned earlier) from it.
    2. Short answers ("2", "yes", "jee haan", "Dubai", "15 dec", an option number) answer the field in last_asked. If options exist and the customer replies with a number, return that option's text.
    3. A later correction replaces the old value ("nahi 4 log hain" -> travellers=4). Do not repeat values already in stored unless the customer changed them.
    4. country: the name from the list. A city implies its country. If the customer means that is where they will stay, add cityToStay too. A country not in the list: return its English name (e.g. "Malaysia", "France"). Only give a country update when the customer wants to travel to / apply for that country; a country mentioned only as an existing visa, past travel or nationality is NOT an update. A city or country the customer travels FROM ("Karachi se", "Karachi sy safar", "from Lahore", "Pakistan se") is NEVER the destination: return it as departureCity, not country.
    5. visaType: ONLY when latest_message states a purpose or visa type, or answers the purpose question. Map by meaning (ghoomna, sair, family ke sath ghoomna, family visit, holiday, tour -> Tourist; naukri, job, kaam, work permit -> the work/job type). If nothing fits, return the customer's own words. "saudi visa chahiye" or "UAE visa" alone has NO visaType: never guess Tourist.
    6. travellers: total people INCLUDING the customer, as digits only ("me and my wife" -> "2"; "hum 3 log" -> "3"; "main, biwi aur 2 bache" -> "4"; "akela", "just me", "only me", "I'm travelling alone", "sirf main", "khud" -> "1"; "hum dono" -> "2"). Add relationship if shown ("wife", "wife and 2 children", "friends"; alone -> "alone"). Never leave travellers empty when the customer clearly said they travel alone.
    7. fullName: ONLY when the customer clearly gives a person's name (answer to the name question, or "mera naam X hai" / "my name is X" / "I am X" / "X here"). Just the name, properly capitalised. A sentence is never a name.
    7b. Read the WHOLE message: one message can answer the last question AND give other facts ("Jamal, Dubai jana hai" -> fullName=Jamal, country=UAE). Capture all of them.
    8. choice fields: exactly one listed option matching the meaning ("jee hai", "haan" -> Yes; "nahi", "nh" -> No).
    9. travelDate: copy the customer's own date words exactly as written ("18 may", "19th-aug", "15/12", "agle mahine", "25 tareekh", "December 2027", "eid ke baad", "flexible"). Do NOT add a year, do NOT convert the format; the system works out the correct year itself.
    10. duration: e.g. "10 days", "2 weeks", "1 month". whatsapp: the digits as given.
    11. If the customer refuses or says they don't know a detail ("pata nahi", "abhi nahi bata sakta", "skip"), do NOT invent a value; leave it out.

    OTHER OUTPUTS
    - intent: ask_countries (asks in general which countries we handle, without naming one specific country), apply, providing_info, question, status, human (wants a person/agent/call/team), restart, cancel (stop / not interested), greeting, smalltalk, other. Pick the main intent.
    - question: ONLY about latest_message itself, never copied from recent_chat. A plain answer is NOT a question -> null. If the message contains any question or request for information (with or without "?"), restate it as one clear English question including the country if known. Otherwise null.
    - confirm: only when stage is "confirming": yes (correct / confirm / submit / theek hai), edit (wants to change something), no; else none.
    - status_lead_id / status_whatsapp: when the customer gives an application reference (like AEG-XXXX) or a phone number for checking status; else null.
    - language: language of latest_message: en, roman_ur (Urdu/Hindi in English letters), ur (Urdu script), ar (Arabic), ps (Pashto), sd (Sindhi), pa (Punjabi, any script), other (any other language). A message written mainly in English words (even with typos like "truck", "prevoius") is en, NOT roman_ur. If the message is too short to tell (a number, a name, "ok", an emoji, a phone number, a date, a single city), return previous_language.
    - frustrated: true if the customer sounds annoyed, confused or says the bot is repeating itself.
    - unclear: true ONLY when you genuinely cannot tell what the customer wants (garbled text, could mean two very different things, or it does not fit the conversation), and it is NOT a simple answer to last_asked, a greeting or a clear question. When in doubt between two meanings, unclear = true.
    - meaning_guess: when unclear is true, your single best guess of what the customer means, as a short phrase in the SAME language and script as latest_message, written so it completes "Kya aap yeh keh rahe hain ke ..." (e.g. "aap UAE ka work visa chahte hain"). Otherwise null.`;
    const schema = { type: 'object', additionalProperties: false,
      required: ['language', 'intent', 'updates', 'question', 'confirm', 'status_lead_id', 'status_whatsapp', 'frustrated', 'unclear', 'meaning_guess'],
      properties: {
        language: { type: 'string', enum: ['en', 'roman_ur', 'ur', 'ar', 'ps', 'sd', 'pa', 'other'] },
        intent: { type: 'string', enum: ['ask_countries', 'apply', 'providing_info', 'question', 'status', 'human', 'restart', 'cancel', 'greeting', 'smalltalk', 'other'] },
        updates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'value'], properties: { field: { type: 'string' }, value: { type: 'string' } } } },
        question: { type: ['string', 'null'] },
        confirm: { type: 'string', enum: ['yes', 'no', 'edit', 'none'] },
        status_lead_id: { type: ['string', 'null'] },
        status_whatsapp: { type: ['string', 'null'] },
        frustrated: { type: 'boolean' }, unclear: { type: 'boolean' }, meaning_guess: { type: ['string', 'null'] } } };
    const recent = history.slice(-4).map(x => ({ role: x.role, text: String(x.text || '').slice(0, x.role === 'assistant' ? 250 : 300) }));
    const userPayload = { today: pkToday(), latest_message: text, last_asked: state.lastAsked, stage: state.stage, previous_language: state.language || latinLangVote(text) || detectLang(text) || 'en', stored: state.data, status_mode: !!state.status, recent_chat: recent };
    const payload = { model: S.UnderstandModel || 'openai/gpt-oss-120b', temperature: 0, max_completion_tokens: 800, reasoning_effort: 'low',
      response_format: { type: 'json_schema', json_schema: { name: 'aeg_understand', strict: true, schema } },
      messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(userPayload) }] };
    return [{ json: { sheetId: msg.sheetId, sessionId: msg.sessionId, text, t0: msg.t0, receivedAt: msg.receivedAt, isNew, state, history,
      skipReason, directUpdate, clarifiedFrom, originalText: clarifiedFrom || text, needUnderstand: !skipReason, understandPayload: skipReason ? null : payload } }];
  }
};
