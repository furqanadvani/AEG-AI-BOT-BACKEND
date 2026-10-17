/**
 * Engine step: Build Reply (ported from n8n node "Build Reply", V18.8).
 * Logic bilkul same hai; n8n ke $(), $input aur static data ab
 * workflow.service ka runtime (services/engine/runtime.js) deta hai.
 */
const H = require("./helpers");

module.exports = function buildReply(rt) {
  const { $, $input, $getWorkflowStaticData } = rt;
  const { toAsciiDigits, norm, has, yes, splitList, titleCase, safeJson, esc, containsTerm, condOk, resolveCountry, visaRows, resolveVisa, supportedVisaNames, refusedVisaNames, activeCountries, pickQuestions, fieldDefFor, relevantFieldDefs, normPhone, prettyPhone, YES_RE, NO_RE, matchChoice, NOT_NAME, TD_MONTHS, TD_NAMES, TD_ALT, TD_AMBIG, tdMonth, tdDays, tdIso, tdYear, NB, friendlyDate, findDateExpr, resolveTravelDate, FLEX_DATE_RE, validateField, detectLang, EN_WORDS, RU_WORDS, latinLangVote, CLOSING_RE, isClosing, scriptOf, langScript, parseRating, pkToday } = H;
  const getCfg = () => rt.cfg;
  {
    const g = $input.first().json;
    const cfg = getCfg(); const S = cfg.settings || {};
    const plan = JSON.parse(JSON.stringify(g.plan || {}));
    const state = g.state || {};
    const history = Array.isArray(g.history) ? g.history : [];
    if (!plan.next) plan.next = state.stage === 'submitted' ? { type: 'after_submit', referenceId: state.leadId } : { type: 'help' };
    if (['status_pending', 'submit_pending', 'query_pending'].includes(plan.next.type)) plan.next = { type: 'lead_failed' }; // sirf tab jab koi branch beech mein ruk jaye
    const lang = state.language || 'roman_ur';
    const nx = plan.next;

    // ---------- Jahan AI ki zaroorat nahi: seedha template ----------
    const tplLang = l => ['en', 'roman_ur', 'ur', 'ar'].includes(l) ? l : (['ps', 'sd'].includes(l) ? 'ur' : 'en');
    const TPL = {
      throttled: { en: "You're sending messages very quickly. Please wait a few seconds, then send your message again.", roman_ur: 'Aap bohat tezi se messages bhej rahe hain. Chand second ruk kar dobara message kar dein.', ur: 'آپ بہت تیزی سے پیغامات بھیج رہے ہیں۔ چند سیکنڈ رک کر دوبارہ پیغام بھیج دیں۔', ar: 'أنت ترسل الرسائل بسرعة كبيرة. يرجى الانتظار بضع ثوانٍ ثم إرسال رسالتك مرة أخرى.' },
    };
    const FEMALE_NAMES = /^(ayesha|aisha|ayeza|fatima|zainab|maryam|mariam|sara|sarah|hira|sana|amna|alina|aleena|zara|zoya|iqra|mahnoor|laiba|anam|nida|sadia|saima|rabia|hina|komal|eman|noor|areeba|kinza|mehwish|sidra|aliza|maham|nimra|rida|aiza)$/i;
    const female = has(S.AssistantGender) ? /^f/i.test(S.AssistantGender) : FEMALE_NAMES.test(String(S.AssistantName || '').trim().split(/\s+/)[0]);
    let skipReplyAI = false, templateReply = '';
    if (nx.type === 'throttled') { skipReplyAI = true; templateReply = TPL.throttled[tplLang(lang)]; }
    // Welcome: har dafa ek jaisa (naam aur gender pakka), AI nahi likhta
    const BOT = S.AssistantName || 'Ayesha', BIZ = S.BusinessName || 'AEG Visa Consultancy';
    const WELCOME = {
      en: `Hello! I'm ${BOT}, the AI assistant of ${BIZ}. I can help you start a visa application, answer your visa questions, or check your application status. How can I help you today?`,
      roman_ur: `Assalam o Alaikum! Main ${BOT} hoon, ${BIZ} ${female ? 'ki' : 'ka'} AI assistant. Main visa application shuru karne, visa ke sawalon ke jawab dene ya aap ki application ka status check karne mein madad kar ${female ? 'sakti' : 'sakta'} hoon. Bataiye, main aap ki kya madad karun?`,
      ur: `السلام علیکم! میں ${BOT} ہوں، ${BIZ} ${female ? 'کی' : 'کا'} اے آئی اسسٹنٹ۔ میں ویزا اپلیکیشن شروع کرنے، ویزا سے متعلق سوالات کے جواب دینے یا آپ کی اپلیکیشن کا اسٹیٹس چیک کرنے میں مدد کر ${female ? 'سکتی' : 'سکتا'} ہوں۔ بتائیے، میں آپ کی کیا مدد کروں؟` };
    if (nx.type === 'welcome' && WELCOME[lang]) { skipReplyAI = true; templateReply = WELCOME[lang]; }
    // Customer ko "Dear <naam>" se mukhatib karna (Mr/Ms, Sir/Madam, Mohtaram nahi). Naam na ho to "Dear Customer".
    const custFirst = String((state.data || {}).fullName || '').trim().split(/\s+/)[0] || '';
    const dearName = l => l === 'ur' ? `ڈیئر ${custFirst || 'کسٹمر'}` : `Dear ${custFirst || 'Customer'}`;
    // Fixed jawab (business ki exact wording): AI nahi likhta. Country ka naam Countries tab ke Notes se.
    const FIXED = {
      country_list: {
        en: 'We provide visa application assistance for all countries worldwide, except for US and French visas.\n\nPlease let us know which country you’re planning to visit, and we’ll be happy to guide you through the process.',
        roman_ur: 'Hum duniya ke tamam mulkon ke visa application mein madad faraham karte hain, siwaye US aur French visa ke.\n\nBarah-e-karam bata dein aap kis mulk jane ka plan kar rahe hain, hum khushi se aapko poore process mein guide karenge.',
        ur: 'ہم دنیا کے تمام ممالک کے ویزا اپلیکیشن میں معاونت فراہم کرتے ہیں، سوائے امریکی (US) اور فرانسیسی ویزا کے۔\n\nبراہ کرم بتائیں کہ آپ کس ملک جانے کا ارادہ رکھتے ہیں، ہم خوشی سے پورے پراسیس میں آپ کی رہنمائی کریں گے۔' },
      blocked_country: {
        en: X => `${dearName('en')}, we do not provide visa consultation or assistance for ${X} visas.\nFor assistance with these visa categories, we recommend contacting their respective official dedicated helplines, who will be able to guide you further.`,
        roman_ur: X => `${dearName('roman_ur')}, hum ${X} visa ke liye consultation ya assistance faraham nahi karte.\nIs visa ke silsile mein madad ke liye hum mashwara dete hain ke aap unki official dedicated helpline se rabta karein, jo aapki behtar rehnumai kar sakegi.`,
        ur: X => `${dearName('ur')}، ہم ${X} ویزا کے لیے کنسلٹیشن یا معاونت فراہم نہیں کرتے۔\nاس ویزا کے سلسلے میں مدد کے لیے ہم مشورہ دیتے ہیں کہ آپ ان کی متعلقہ آفیشل ہیلپ لائن سے رابطہ کریں، جو آپ کی مزید رہنمائی کر سکے گی۔` },
    };
    if (FIXED[nx.type]) {
      const L = FIXED[nx.type][tplLang(lang)] ? tplLang(lang) : 'en';
      const t = FIXED[nx.type][L];
      const bc = (cfg.countries || []).find(c => c.name === nx.country); const adj = (bc && bc.note) || nx.country || '';
      skipReplyAI = true; templateReply = typeof t === 'function' ? t(adj) : t;
    }
    // Fixed jawab ke baad application jari rakhni ho: fixed text code jorta hai (Finalize), AI sirf agla sawal likhta hai
    let prefixReply = '';
    if (skipReplyAI && templateReply && plan.resume && nx.type === 'blocked_country') { prefixReply = templateReply; skipReplyAI = false; templateReply = ''; }

    // ---------- Customer ki details ----------
    const collected = {};
    const isPhoneField = f => f === 'whatsapp' || ((fieldDefFor(cfg, state.data || {}, f) || {}).type === 'phone');
    for (const x of (g.summary || [])) if (has(x.value)) collected[x.label] = isPhoneField(x.field) ? prettyPhone(x.value) : x.value;
    for (const [k, v] of Object.entries(state.data || {})) if (has(v) && !(g.summary || []).some(x => x.field === k)) collected[k] = v;
    const firstName = String((state.data || {}).fullName || '').trim().split(/\s+/)[0] || '';
    const assistantMsgs = history.filter(h => h.role === 'assistant').map(h => String(h.text || ''));
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1] || '';
    const useNameNow = !!firstName && !norm(lastAssistant).includes(norm(firstName)) && (['lead_created', 'confirm_summary', 'feedback_thanks'].includes(nx.type) || (state.turns || 0) % 4 === 0);
    const askedBefore = assistantMsgs.slice(-4).map(t => (String(t).match(/[^.!?\u061F\n]*[?\u061F]/g) || []).pop()).filter(Boolean).map(q => q.trim().slice(0, 160)); // V18.8
    const avoidOpeners = assistantMsgs.slice(-3).map(t => t.replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ')).filter(Boolean);

    // ---------- Is turn ki instructions (sirf jo zaroori hai, tokens bachte hain) ----------
    const support = S.SupportPhone ? ` (${S.SupportPhone})` : '';
    const optsLine = o => (o && o.length) ? ' List the options numbered, each on its own line, and say they can simply reply with the number.' : '';
    // Purpose / choice: pehli dafa khula sawal (list nahi). List sirf jab jawab samajh na aaye ya dobara poochna pare
    const openLine = f => (f.options && f.options.length && ['visatype', 'choice'].includes(f.fieldType)) ? (((f.attempt || 1) >= 2 || (plan.issues || []).some(i => i.field === f.field)) ? optsLine(f.options) : ' Ask it as an open question in natural words. Do NOT list or number the options; the customer answers in their own words.') : optsLine(f.options);
    function askInstr(f) {
      let t = `Ask for "${f.label}" (meaning: ${f.ask || f.label}) in your own natural words, as the only question. If that meaning text is about a different detail than "${f.label}", ignore it and ask about ${f.label}.${openLine(f)}`;
      if (f.why) t += ` If the customer seems hesitant or asked why, explain in one line: ${f.why}.`;
      if (f.attempt === 2) t += ' This detail is still missing after the customer\'s last message: do NOT reuse your earlier wording from recent_chat; ask more simply and give a short example of a valid answer.';
      if (f.attempt >= 3) t += ` This detail has been asked ${f.attempt} times: acknowledge it kindly in a few words, make it as easy as possible (example answer), and add that if it is easier they can type "team" to talk to our team${support}.`;
      return t;
    }
    const data0 = state.data || {};
    const NEXT = {
      goodbye: nx.repeat ? 'Reply with one very short, warm closing line only. No question.' : 'The customer needs nothing more. Close warmly in one or two short lines: thank them and say they can message anytime (in Urdu / Roman Urdu you may end with "Allah Hafiz"). Do NOT ask any question and do NOT ask for any detail.',
      offer_apply: `After answering (if there was a question), offer lightly in one line to help them start a visa application${state.data && state.data.country ? ' for ' + state.data.country : ', e.g. ask which country they are planning for'}. Do NOT ask for their name, number or any other personal detail yet.`,
      welcome: 'Greet warmly in one line, introduce yourself by name, and say you can help start a visa application, answer visa questions, or check an application status. End by asking how you can help.',
      help: nx.greeted ? 'The customer greeted again: greet back briefly (do not re-introduce yourself) and ask in one short line how you can help.' : 'Reply briefly and naturally to what they said, then ask in one short line how else you can help.',
      answer_only: 'Just answer. Do not push the application again. You may close with one short friendly line (no question needed).',
      ask_field: nx.type === 'ask_field' ? (nx.soft ? `Do not push. After answering, offer lightly in one line to start an application and ask for "${nx.label}" (${nx.ask || nx.label}).${openLine(nx)}` : askInstr(nx)) : '',
      confirm_summary: nx.short
        ? 'Do NOT list the details again. In one or two short lines, ask them to reply "Confirm" to submit, or tell you what to change.'
        : `${nx.changed ? 'First say in a few words that it has been updated. ' : ''}List the collected details, each on its own line as "- Label: value" (translate labels into the reply language; show dates in friendly form). Then ask them to reply "Confirm" if everything is correct, or tell you what to change.`,
      ask_edit: 'Ask which detail they would like to change.',
      ask_contact_for_query: nx.type === 'ask_contact_for_query' ? `Say you will pass this to our team so they can reply properly, and ask for the customer's ${nx.label} (${nx.ask}).${nx.attempt >= 2 ? ' They did not share it last time: explain in one line that the team needs it only to reply to them, and give an example.' : ''}` : '',
      query_dropped: `Say it is completely fine, no pressure. Tell them our team can also be reached directly${support}, and that you are here if they want to continue or ask anything else.`,
      query_logged: `${''}${state.lastLead && nx.queryType === 'HUMAN' ? `If the customer complained (e.g. no one contacted them), apologise sincerely in one line and say this has been escalated to our team as a priority for application ${state.lastLead.leadId}. ` : ''}Say it has been forwarded to our team (reference ${nx.referenceId || ''}) and they will contact the customer on WhatsApp${data0.whatsapp ? ' at ' + prettyPhone(data0.whatsapp) : ''}. Do NOT ask for their name or number; we already have them.${plan.resume ? ` Then, in the same message, continue the application: ${askInstr(plan.resume)}` : ''}`,
      query_failed: 'Apologise briefly for a small technical issue and ask them to send the message again in a minute.',
      lead_failed: 'Apologise briefly for a small technical issue and ask them to send "Confirm" again in a minute. Their details are safe.',
      lead_created: `Thank them${firstName ? ' (' + firstName + ')' : ''}, give the reference number ${nx.referenceId || ''}, and say our consultant will contact them on WhatsApp soon.${nx.askFeedback ? ' End with one short, optional request: rate this chat from 1 to 5. Ask nothing else.' : ' Say they can ask anything meanwhile.'}`,
      duplicate: `Say an application for this is already in progress (reference ${nx.referenceId || ''}, status ${nx.status || ''}) and our team is on it. Offer help with anything else.`,
      status_ask: nx.type === 'status_ask' ? `Ask for what is missing: ${(nx.need || []).map(x => x === 'reference_id' ? 'the reference number (like AEG-XXXX) from their confirmation message' : 'the WhatsApp number used in the application').join(' and ')}. Say both are needed to protect their privacy.${nx.attempt >= 2 ? ' Keep it very short; do not repeat the privacy explanation word for word.' : ''}` : '',
      status_result: `Share clearly: reference ${nx.referenceId || ''}, country ${nx.country || ''}, visa type ${nx.visaType || ''}, status ${nx.status || ''}${nx.lastUpdated ? ', last updated ' + nx.lastUpdated : ''}. Offer help with anything else.`,
      status_not_found: `No application matched that reference and number. Ask them to double-check.${nx.attemptsLeft === 0 ? ` Suggest talking to our team${support}.` : ''}`,
      status_locked: `Say you could not verify the details here, and offer to connect them with our team${support}.`,
      cancelled: `Acknowledge kindly in one or two lines and match their reason (e.g. if they already got the visa elsewhere, say no problem and wish them a good trip${/umr|hajj/i.test(nx.visaType || '') ? ', and pray their ' + nx.visaType + ' is accepted' : ''}). Say we are happy to help next time. No question, no persuasion, no "noted".`,
      refused_final: 'No question in this message. Do not ask which visa type fits.',
      confirm_phone: `Repeat the WhatsApp number exactly as "${nx.number || ''}" and ask in one short question whether it is correct (they can reply yes, or send the right number). Ask nothing else.`,
      after_submit: nx.repeat ? 'Their application is already with our team. Reply briefly and warmly to what they said; do not repeat the reference number unless they ask. No pushing.' : `Their application (reference ${nx.referenceId || ''}) is with our team. Offer help with anything else.`,
      feedback_thanks: `They rated the chat ${nx.rating}/5. Thank them sincerely in one line.${nx.rating <= 3 ? ' Briefly say you are sorry it was not better and the team will keep improving.' : ''} No question.`,
      human_already: `Say our team already has their request and will contact them soon${support}. Offer help with anything else meanwhile.`,
    };
    let nextInstr = NEXT[nx.type] || NEXT.help;
    if (plan.refusedVisa && nx.type === 'ask_field' && nx.field === 'visaType') nextInstr = 'The question about which type fits (above) is the only question. Do not ask anything else.';
    // Kisi aur detail (jaise date) ka masla isi message mein poocha ja raha hai: agla sawal agle turn mein, ek waqt mein ek sawal
    if (nx.type === 'ask_field' && (plan.issues || []).some(i => i.field !== nx.field)) nextInstr = 'Do NOT ask any other question in this message; the clarification above is the only question.';
    if (prefixReply && plan.resume && plan.resume.otherCountry) nextInstr = `The customer has ALREADY been told we do not handle ${nx.country || 'that'} visas; do NOT repeat it and do not greet. In one short line ask which other country they are planning to visit (we help with almost every other country). Do not say "continue your application".`;
    else if (prefixReply) nextInstr = `The customer has ALREADY been told we do not handle ${nx.country || 'that'} visas; do NOT repeat or mention that again and do not greet. In one short line say we can continue their ${plan.resumeCountry || ''} application, then: ${askInstr(plan.resume)}`;
    // FIX 3: isi detail ka masla upar bata diya to sirf EK sawal, dobara alag sawal nahi
    if (nx.type === 'ask_field' && (plan.issues || []).some(i => i.field === nx.field)) nextInstr = 'Ask only ONE short question at the end, about this same detail, combined with the clarification above. No second question, no extra example question.';

    const ISSUE = { not_a_name: 'ask for their full name (example: Ali Raza)', invalid_phone: 'ask for a mobile number like 03XX XXXXXXX', out_of_range: 'ask for a realistic number', not_a_number: 'ask for a number', not_in_options: 'show the options again, numbered', date_in_past: 'in one short line say this date has already passed and ask for their correct travel date; do not suggest any date', date_too_far: 'say we can take travel plans only within the period shown and ask for a nearer date', date_too_soon: 'say this is too close for visa processing and ask for a date on or after the one shown', invalid_date: 'say this date does not exist on the calendar (e.g. 31 February) and ask for the correct date', unclear_date: 'ask when they plan to travel (a date like 18 May, or at least the month)', unclear_duration: 'ask how many days or weeks', too_long: 'ask for a shorter answer', unclear_country: 'ask which country they plan to visit (do not list countries)', single_name: 'ask politely for their full name as on the passport, including surname (e.g. Khurram Shahzad); if that is their complete name, they can simply send it again', return_before_travel: 'say the return date must be after the travel date shown, and ask how many days they will stay' };
    const parts = [];
    if (plan.identityAsk) parts.push(`The customer asked whether you are a bot / AI / human. Answer honestly in one line: you are ${BOT}, ${BIZ}'s AI assistant, and if they prefer a person they can type "team". Never claim to be human.`);
    if (plan.frustrated) parts.push('The customer sounds frustrated or confused: open with one short, sincere line of empathy (no over-apologising), then keep everything extra simple.');
    if (plan.question) parts.push(`Answer the customer's question first: "${plan.question}". Use ONLY the KNOWLEDGE block. If the answer is not there, say honestly that our team will confirm it, and copy the question into unanswered_question (otherwise unanswered_question must be null). Never guess fees, document lists, processing times, approval chances or policies.`);
    if (plan.unsupportedCountry) parts.push(`Politely say we currently don't process visas for ${plan.unsupportedCountry.asked}. Say we help with most other destinations and ask which country they plan to visit. Do NOT list countries.`);
    if (plan.refusedVisa && plan.refusedVisa.repeat) parts.push(`The customer insists they need a ${plan.refusedVisa.asked} visa, which we do not handle. Do NOT repeat your earlier message and do NOT list visa types again. In two short lines: acknowledge kindly that they need a ${plan.refusedVisa.asked} visa, say we unfortunately can't help with it and suggest the official channel or relevant authority, and say we are happy to help if they ever need another kind of visa.`);
    else if (plan.refusedVisa && plan.refusedVisa.unknown) parts.push(`The customer's purpose ("${plan.refusedVisa.asked}") is not one we handle. Politely say so in one line, then tell them the visa types we do handle${data0.country ? ' for ' + data0.country : ''}: ${(plan.refusedVisa.supportedTypes || []).join(', ')} (as a short numbered list), and ask which one fits their trip.`);
    else if (plan.refusedVisa) parts.push(`Politely but clearly say we don't handle ${plan.refusedVisa.asked} visas${plan.refusedVisa.businessNote ? ' (' + plan.refusedVisa.businessNote + ')' : ''}; name the types we do handle and invite them to continue if one fits.`);
    if (plan.forwardVisa) parts.push(`Say ${plan.forwardVisa.asked} visas are handled directly by our team and you will pass it on${plan.forwardVisa.businessNote ? ' (' + plan.forwardVisa.businessNote + ')' : ''}.`);
    const issueLine = i => i.reason === 'date_in_past'
      ? `for ${i.label}: in ONE short line say the date the customer gave (\"${i.given}\", in friendly form with its year) has already passed, and ask for their correct travel date. Do NOT suggest or guess any other date`
      : `for ${i.label}: ${ISSUE[i.reason] || 'ask again'}${i.detail ? ' (' + i.detail + ')' : ''}`;
    const hardIssues = (plan.issues || []).filter(i => !i.soft), softIssues = (plan.issues || []).filter(i => i.soft);
    if (state.lastReplyRepeated) parts.unshift('Your previous message was almost the same as an earlier one. This time use clearly different wording and sentence structure, and keep it shorter.');
    if (hardIssues.length) parts.push('Gently say what was not clear and ' + hardIssues.map(issueLine).join('; ') + '. Never use words like "in brackets" or "shown above".');
    for (const i of softIssues) parts.push(i.reason === 'date_confirm_year'
      ? `The customer wrote "${i.given}" without a year, so it means ${i.detail}. Do NOT say the date has passed and do not explain why. Just confirm in ONE short friendly question, like "Aap ${i.detail} ki baat kar rahe hain na?" (in the reply language, date with its year). They can reply yes or send another date.`
      : `The customer said that ${i.label} is not right. Say "koi baat nahi" style in 2-3 words and ask for their correct ${i.label} in ONE short question with a tiny example (like 18 May 2027).`);
    if (plan.clarify) parts.push(`You are not fully sure what the customer meant. Check your understanding in ONE short, friendly question, like "Kya aap yeh keh rahe hain ke ${plan.clarify}?" (in the reply language), and add that if not, they can tell you in their own words. Do not guess, do not move on.`);
    if (plan.clarifyRejected) parts.push('Your earlier guess about what the customer meant was wrong. Say sorry in 2-3 words (no long apology) and kindly ask them to tell you once more in their own words, with a tiny example of what they could write.');
    const noAck = (plan.issues || []).length || plan.clarify || plan.clarifyRejected || plan.refusedVisa || plan.unsupportedCountry || plan.blockedCountry || ['refused_final', 'cancelled', 'confirm_phone'].includes(nx.type) || (plan.question && !(plan.saved || []).some(s => s.field !== 'country'));
    if (noAck) parts.push('Do NOT say "noted", "got it", "samajh gaya/gayi" or similar about anything in this message.');
    else if ((plan.saved || []).length) parts.push('Details just received: usually no acknowledgement, at most a 2-4 word natural phrase, different from earlier messages. Never write "X saved". If several details came at once you may confirm them in one short phrase. No "Great/Perfect/Zabardast" after a negative answer; reassure instead.');
    if (plan.dateSaved) parts.push(`The travel date was saved as ${plan.dateSaved.value}${plan.dateSaved.rolled ? ' (the next upcoming one, since this year\'s has already passed)' : ''}. Repeat exactly "${plan.dateSaved.value}" (with the year) in a few words so the customer can correct it if wrong.`);
    if (plan.durationFromReturn) parts.push(`The customer gave a return date, so the stay was taken as ${plan.durationFromReturn}. Say this in a few words so they can correct it.`);
    if (plan.skippedField) parts.push(`Say in a few words that "${plan.skippedField.label}" can be discussed with our team later, no problem.`);
    if (plan.clarify || plan.clarifyRejected) nextInstr = 'Do NOT ask any other question in this message; the check above is the only question.';
    parts.push('Then: ' + nextInstr);

    // ---------- Zaban ----------
    const LANG = {
      en: 'Simple, polite, natural English.',
      roman_ur: 'Roman Urdu exactly the way educated Pakistanis text on WhatsApp (e.g. "Ji bilkul, main aapki madad karti hoon"). Respectful "aap". Common English visa words (visa, apply, documents, passport) are fine.',
      ur: 'Proper Urdu script, respectful "آپ". Write English terms in Urdu script (ویزا، اپلائی، پاسپورٹ). Never switch to Roman Urdu or English.',
      ar: 'Clear, polite Modern Standard Arabic in Arabic script.',
      ps: 'Pashto in Pashto script, polite and simple.',
      sd: 'Sindhi in Sindhi script, polite and simple.',
      pa: 'Punjabi in the same script the customer uses (Shahmukhi or Roman), polite and simple.',
      other: 'The same language and script as language_sample / latest_message.',
    };
    const EX = {
      en: ['Customer: I want to go to Dubai for a holiday\nYou: Sure, we regularly handle UAE tourist visas. How many people are travelling, just you or family as well?',
           'Customer: what is your fee? (not in KNOWLEDGE)\nYou: Fair question. Our team will confirm the exact fee so you get accurate information. Meanwhile, when are you planning to travel?'],
      roman_ur: [`Customer: mujhe dubai jana hai ghoomne\nYou: Zaroor, UAE ka tourist visa hum regularly process karte hain. Aap kitne log travel kar rahe hain, sirf aap ya family bhi saath hogi?`,
           `Customer: fees kitni hai? (KNOWLEDGE mein nahi)\nYou: Bilkul jayez sawal hai. Exact fee main team se confirm ${female ? 'karwa deti' : 'karwa deta'} hoon taake aapko ghalat maloomat na milay. Tab tak bata dein, aap kab travel karna chahte hain?`],
      ur: [`Customer: مجھے دبئی گھومنے جانا ہے\nYou: ضرور، یو اے ای کا ٹورسٹ ویزا ہم باقاعدگی سے پراسیس کرتے ہیں۔ آپ کتنے لوگ سفر کر رہے ہیں، صرف آپ یا فیملی بھی ساتھ ہوگی؟`,
           `Customer: فیس کتنی ہے؟ (KNOWLEDGE میں نہیں)\nYou: بالکل جائز سوال ہے۔ درست فیس میں ٹیم سے کنفرم ${female ? 'کروا دیتی' : 'کروا دیتا'} ہوں تاکہ آپ کو غلط معلومات نہ ملیں۔ تب تک بتا دیں، آپ کب سفر کرنا چاہتے ہیں؟`],
      ar: ['Customer: أريد السفر إلى دبي للسياحة\nYou: بكل سرور، نحن نتعامل مع تأشيرة الإمارات السياحية بشكل منتظم. كم عدد المسافرين، أنت فقط أم معك العائلة؟',
           'Customer: كم الرسوم؟ (غير موجود في KNOWLEDGE)\nYou: سؤال في محله. سيؤكد فريقنا الرسوم الدقيقة حتى تحصل على معلومة صحيحة. وفي الأثناء، متى تخطط للسفر؟'],
    };
    const examples = (EX[lang] || EX.en).join('\n\n');

    const tone = S.BotTone || 'Calm, warm and confident, like an experienced senior consultant at the front desk: respectful, clear, never salesy, no exaggerated excitement, no repeated apologies.';
    const bizInfo = [S.OfficeHours && 'Office hours: ' + S.OfficeHours, S.OfficeAddress && 'Address: ' + S.OfficeAddress, S.SupportPhone && 'Phone: ' + S.SupportPhone].filter(Boolean).join(' | ') || 'not provided';
    // Static hissa pehle (cache hota hai), is turn wala hissa aakhir mein
    const system = `You are ${BOT}, the AI chat assistant of ${BIZ} in Pakistan. ${tone}${['roman_ur', 'ur', 'pa'].includes(lang) ? ` Speak as a ${female ? 'woman. Always female verb forms: karti hoon, sakti hoon, samajh gayi, rahi hoon, deti hoon (کرتی ہوں، سکتی ہوں). Never karta, sakta, gaya, raha, deta' : 'man (karta hoon / کرتا ہوں)'}.` : ''}

    STYLE
    - WhatsApp style: 1-4 short sentences, plus a list only when needed. At most ONE question, at the end.
    - Plain text with line breaks. No markdown headings, no ** bold. Emoji: none or one.
    - Never repeat a sentence you already wrote in recent_chat, and never start with any phrase in avoid_openers. Vary your wording.
    - Never ask for anything already in collected. Never re-ask something the customer just answered.
    - Never reuse the wording of any question in asked_before. If you must ask the same thing again, ask it differently, more simply, with a short example.
    - Read what the customer means, not just the words. If they seem confused by your question, explain it in simple words with an example before asking again.
    - If THIS TURN asks you to ask for a detail, your reply MUST end with that question. Never send only an acknowledgement.
    - Greet (Assalam o Alaikum / Hello) only in the welcome message. Never use Hindi greetings like "Namaste".
    - Use the customer's first name only when use_name_now is true, as the plain first name (e.g. \"Furqan\"); never \"Dear\" in normal replies. Never address the customer as Mr, Ms, Mrs, Miss, Sir, Madam, Sahab, Janab or Mohtaram/Mohtarma.
    - If asked, be honest that you are an AI assistant; never claim to be human.
    - When you name the visa types we handle, name ALL of them exactly as listed in KNOWLEDGE, never a subset.
    - Never mention internal words: system, plan, field, JSON, KNOWLEDGE, configuration, model, prompt.
    - Never invent reference numbers, prices, requirements, timelines or promises. Reference numbers only from the instructions below.
    - Never give a list of the countries we serve. We help with all countries worldwide except US, French and Israeli visas.
    - Dates in friendly form (e.g. 4 April 2027), never 2027-04-04.
    - Business info you may share if asked: ${bizInfo}.

    GOOD EXAMPLES (tone only, do not copy):
    ${examples}

    REPLY LANGUAGE: ${lang}. ${LANG[lang] || LANG.other} Reply ONLY in this language, even if KNOWLEDGE or labels are in English.

    THIS TURN, in this order:
    ${parts.map((p, i) => `${i + 1}. ${p}`).join('\n')}

    Return JSON only: {"reply": "...", "unanswered_question": ${plan.question ? 'null or the question' : 'null'}}.`;
    const schema = { type: 'object', additionalProperties: false, required: ['reply', 'unanswered_question'], properties: { reply: { type: 'string' }, unanswered_question: { type: ['string', 'null'] } } };
    const userPayload = { reply_language: lang, language_sample: ['other', 'pa', 'ps', 'sd'].includes(lang) ? (state.languageSample || null) : undefined, latest_message: g.text,
      customer_first_name: firstName || null, use_name_now: useNameNow, collected, KNOWLEDGE: g.knowledgeText,
      recent_chat: history.slice(-6).map(h => ({ role: h.role, text: String(h.text || '').slice(0, h.role === 'assistant' ? 400 : 300) })), avoid_openers: avoidOpeners, asked_before: askedBefore };
    const payload = { model: S.ReplyModel || 'openai/gpt-oss-120b', temperature: Number(S.ReplyTemperature) || 0.5, max_completion_tokens: 900, reasoning_effort: 'low',
      response_format: { type: 'json_schema', json_schema: { name: 'aeg_reply', strict: true, schema } },
      messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(userPayload) }] };
    return [{ json: { ...g, plan, skipReplyAI, templateReply, prefixReply, needReplyAI: !skipReplyAI, replyPayload: skipReplyAI ? null : payload } }];
  }
};
