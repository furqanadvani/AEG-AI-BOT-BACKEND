/**
 * Engine step: Finalize (ported from n8n node "Finalize", V18.8).
 * Logic bilkul same hai; n8n ke $(), $input aur static data ab
 * workflow.service ka runtime (services/engine/runtime.js) deta hai.
 */
const H = require("./helpers");

module.exports = function finalize(rt) {
  const { $, $input, $getWorkflowStaticData } = rt;
  const { toAsciiDigits, norm, has, yes, splitList, titleCase, safeJson, esc, containsTerm, condOk, resolveCountry, visaRows, resolveVisa, supportedVisaNames, refusedVisaNames, activeCountries, pickQuestions, fieldDefFor, relevantFieldDefs, normPhone, prettyPhone, YES_RE, NO_RE, matchChoice, NOT_NAME, TD_MONTHS, TD_NAMES, TD_ALT, TD_AMBIG, tdMonth, tdDays, tdIso, tdYear, NB, friendlyDate, findDateExpr, resolveTravelDate, FLEX_DATE_RE, validateField, detectLang, EN_WORDS, RU_WORDS, latinLangVote, CLOSING_RE, isClosing, scriptOf, langScript, parseRating, pkToday } = H;
  const getCfg = () => rt.cfg;
  {
    const g = $('Build Reply').first().json;
    const state = JSON.parse(JSON.stringify(g.state));
    const lang = state.language || 'roman_ur';
    const nx = (g.plan && g.plan.next) || {};
    let reply = '', unanswered = null, replyAiOk = false;
    if (g.skipReplyAI) reply = String(g.templateReply || '');
    else {
      try {
        const r = $('AI Reply').first().json || {};
        const c = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
        if (c) { const p = JSON.parse(String(c).replace(/```json|```/g, '').trim()); reply = String(p.reply || '').trim(); unanswered = p.unanswered_question || null; replyAiOk = !!reply; }
      } catch (e) {}
    }
    if (!reply) {
      // AI #2 fail ho jaye to seedha, mehfooz jawab (customer ki zaban mein)
      const T = {
        en: { sorry: 'Sorry, I am having a small technical issue.', ask: 'Could you please share your ', q: '?', ref: 'Your reference number is ', again: 'Please send your message again in a minute.' },
        roman_ur: { sorry: 'Maazrat, abhi thora technical masla aa raha hai.', ask: 'Barah-e-karam apna ', q: ' batayein?', ref: 'Aapka reference number hai ', again: 'Ek minute baad dobara message kar dein.' },
        ur: { sorry: 'معذرت، ابھی تھوڑا تکنیکی مسئلہ ہے۔', ask: 'براہ کرم اپنا ', q: ' بتائیں؟', ref: 'آپ کا ریفرنس نمبر ہے ', again: 'ایک منٹ بعد دوبارہ پیغام بھیج دیں۔' },
        ar: { sorry: 'عذرًا، هناك مشكلة تقنية بسيطة.', ask: 'من فضلك أرسل ', q: '؟', ref: 'رقمك المرجعي هو ', again: 'يرجى إرسال رسالتك مرة أخرى بعد دقيقة.' } };
      const L = T[lang] || (['ps', 'sd'].includes(lang) ? T.ur : T.en);
      if (nx.type === 'lead_created' || nx.type === 'duplicate') reply = `${L.ref}${nx.referenceId}.`;
      else if (nx.type === 'ask_field') reply = g.aiLimited ? `${L.ask}${nx.label}${L.q}` : `${L.sorry} ${L.ask}${nx.label}${L.q}`;
      else if (g.aiLimited && ['confirm_phone', 'confirm_summary', 'status_result', 'status_ask', 'status_not_found'].includes(nx.type)) {
        // AI limit mode: in steps ke liye seedhe templates, taake customer application / status poora kar sake
        const lk = ['en', 'roman_ur', 'ur'].includes(lang) ? lang : (['ps', 'sd'].includes(lang) ? 'ur' : 'en');
        const sum = (g.summary || []).filter(x => x.value).map(x => `- ${x.label}: ${x.value}`).join('\n');
        const N = {
          confirm_phone: { en: `Is this your WhatsApp number: ${nx.number}? Please reply Yes or No.`, roman_ur: `Kya yeh aapka WhatsApp number hai: ${nx.number}? Haan ya Nahi likh dein.`, ur: `کیا یہ آپ کا واٹس ایپ نمبر ہے: ${nx.number}؟ ہاں یا نہیں لکھ دیں۔` },
          confirm_summary: { en: `Please check your details:\n${sum}\n\nReply "Confirm" if everything is correct, or tell me what to change.`, roman_ur: `Apni details check kar lein:\n${sum}\n\nSab theek ho to "Confirm" likh dein, ya bata dein kya badalna hai.`, ur: `اپنی تفصیلات چیک کر لیں:\n${sum}\n\nسب درست ہو تو "Confirm" لکھ دیں، یا بتائیں کیا تبدیل کرنا ہے۔` },
          status_result: { en: `Reference ${nx.referenceId}: ${nx.country} ${nx.visaType} visa, status: ${nx.status} (updated ${nx.lastUpdated}).`, roman_ur: `Reference ${nx.referenceId}: ${nx.country} ${nx.visaType} visa, status: ${nx.status} (updated ${nx.lastUpdated}).`, ur: `ریفرنس ${nx.referenceId}: ${nx.country} ${nx.visaType} ویزا، اسٹیٹس: ${nx.status} (${nx.lastUpdated})۔` },
          status_ask: { en: 'Please share your reference number (e.g. AEG-XXXX) and the WhatsApp number used in the application.', roman_ur: 'Barah-e-karam apna reference number (jaise AEG-XXXX) aur application wala WhatsApp number bhej dein.', ur: 'براہ کرم اپنا ریفرنس نمبر (جیسے AEG-XXXX) اور درخواست والا واٹس ایپ نمبر بھیج دیں۔' },
          status_not_found: { en: 'I could not find an application with these details. Please check the reference and WhatsApp number.', roman_ur: 'In details se koi application nahi mili. Barah-e-karam reference aur WhatsApp number check kar lein.', ur: 'ان تفصیلات سے کوئی درخواست نہیں ملی۔ براہ کرم ریفرنس اور واٹس ایپ نمبر چیک کر لیں۔' },
        };
        reply = N[nx.type][lk];
      }
      else if (g.aiLimited) {
        // AI limit / AI off: workflow normal (rule-based) chalta rehta hai, customer ko "technical issue" nahi bola jata
        const B = { en: 'Thank you for your message. Our team has noted it and will get back to you shortly.', roman_ur: 'Aapka message mil gaya hai, shukriya. Hamari team jald aap se rabta karegi.', ur: 'آپ کا پیغام موصول ہو گیا ہے، شکریہ۔ ہماری ٹیم جلد آپ سے رابطہ کرے گی۔', ar: 'شكرًا لرسالتك. سيتواصل معك فريقنا قريبًا.' };
        reply = B[lang] || (['ps', 'sd'].includes(lang) ? B.ur : B.en);
      }
      else reply = `${L.sorry} ${L.again}`;
    }
    // Agla sawal reh gaya ho (sirf "samajh gaya" likha) to khud jor do, taake baat atke nahi
    if (replyAiOk && nx.type === 'ask_field' && !/[?\u061F]/.test(reply) && !/(^|\n)\s*\d+[.)]\s/.test(reply)) {
      const Q = { en: ['Could you please share your ', '?'], roman_ur: ['Barah-e-karam apna ', ' bata dein?'], ur: ['براہ کرم اپنا ', ' بتا دیں؟'], ar: ['من فضلك أرسل ', '؟'] }[lang] || ['Could you please share your ', '?'];
      reply = reply.replace(/\s+$/, '') + '\n' + Q[0] + (lang === 'en' ? String(nx.label || '').toLowerCase() : nx.label) + Q[1]; // sheet ka andar wala "WhatToAsk" text kabhi customer ko nahi
    }
    if (g.prefixReply) reply = String(g.prefixReply).trim() + '\n\n' + reply.trim();
    state.lastNext = nx.type || null;
    // Markdown safai
    reply = reply.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    const replyPlain = reply;
    // V18.8: jawab pichle 3 jawabon jaisa hi ho to agle turn par AI ko alag andaaz mein likhne ko kaha jata hai
    const simTok = s => new Set(String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(w => w.length > 1));
    const simOf = (a, b) => { const A = simTok(a), B = simTok(b); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(A.size, B.size); };
    const prevReplies = (g.history || []).filter(h => h.role === 'assistant').slice(-3).map(h => h.text);
    state.lastReplyRepeated = !g.skipReplyAI && prevReplies.some(p => simOf(p, replyPlain) >= 0.8);
    const userText = String(g.originalText || g.text || '');
    // Chat widget akeli line-break ko jor deta hai; har line alag dikhane ke liye hard break
    const replyOut = reply.replace(/([^\n])\n(?!\n)/g, '$1  \n');

    const history = (g.history || []).concat([{ role: 'user', text: userText.slice(0, 600) }, { role: 'assistant', text: replyPlain.slice(0, 900) }]).slice(-16);

    // Jawab na mil saka: ek hi sawal do dafa log nahi hota
    const normQ = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    let query = null;
    if (!(g.plan && g.plan.question)) unanswered = null; // sirf customer ka asli sawal log ho, bot ke apne sawal nahi
    if (unanswered) {
      const key = normQ(unanswered).slice(0, 120);
      state.loggedQuestions = Array.isArray(state.loggedQuestions) ? state.loggedQuestions : [];
      if (!state.loggedQuestions.includes(key)) {
        const d = state.data || {};
        if (d.fullName && d.whatsapp) {
          query = { QueryID: 'Q-' + Date.now().toString(36).toUpperCase(), CreatedAt: new Date().toISOString(), Type: 'UNANSWERED', Question: String(unanswered).slice(0, 1000) + (state.leadId ? ` (Lead ${state.leadId})` : ''),
            Country: d.country || '', VisaType: d.visaType || '', FullName: d.fullName, WhatsApp: d.whatsapp, AssignedAgent: '', Status: 'Open', SessionID: g.sessionId };
          state.loggedQuestions = state.loggedQuestions.concat([key]).slice(-10);
        } else if (!(state.openQuestions || []).map(normQ).includes(normQ(unanswered))) state.openQuestions = (state.openQuestions || []).concat([unanswered]).slice(-5);
      }
    }

    // Tokens (asal ginti Groq ke "usage" se)
    const usage = n => { try { const j = $(n).first().json; return (j && j.usage) || {}; } catch (e) { return {}; } };
    const u1 = g.skipReason ? {} : usage('AI Understand');
    const u2 = g.skipReplyAI ? {} : usage('AI Reply');
    const tok = { AI1_In: u1.prompt_tokens || 0, AI1_Out: u1.completion_tokens || 0, AI2_In: u2.prompt_tokens || 0, AI2_Out: u2.completion_tokens || 0 };
    const latency = g.t0 ? Date.now() - Number(g.t0) : '';

    let stateStr = JSON.stringify(state), histStr = JSON.stringify(history);
    while (histStr.length > 30000 && history.length > 2) { history.shift(); histStr = JSON.stringify(history); }
    const session = { SessionID: g.sessionId, Stage: state.stage, Language: state.language, State: stateStr, History: histStr, CreatedAt: state.createdAt || '', UpdatedAt: new Date().toISOString() };
    const log = { Timestamp: new Date().toISOString(), SessionID: g.sessionId, Language: state.language, Intent: (g.understood && g.understood.intent) || '', Next: nx.type || '',
      SkipReason: g.skipReason || (g.aiOk ? '' : (g.aiLimited ? 'ai_limited' : 'ai1_failed')) || '', ...tok, TotalTokens: tok.AI1_In + tok.AI1_Out + tok.AI2_In + tok.AI2_Out, LatencyMs: latency,
      Feedback: g.feedbackRating || '', ReplyAI: g.skipReplyAI ? 'template' : (replyAiOk ? 'ok' : (g.aiLimited ? 'limited' : 'fallback')), Message: userText.slice(0, 300), Reply: replyPlain.slice(0, 500) };
    // Taaza session workflow memory mein (agla message Sheet ka intezar kiye baghair yahin se parhe)
    try {
      const sdS = $getWorkflowStaticData('global'); sdS.sessions = sdS.sessions || {};
      sdS.sessions[g.sessionId] = { state, history, at: session.UpdatedAt };
      const cut = Date.now() - 24 * 3600 * 1000; const keys = Object.keys(sdS.sessions);
      for (const k of keys) if (Date.parse(sdS.sessions[k].at || 0) < cut) delete sdS.sessions[k];
      const left = Object.keys(sdS.sessions); if (left.length > 150) left.sort((a, b) => String(sdS.sessions[a].at).localeCompare(String(sdS.sessions[b].at))).slice(0, left.length - 150).forEach(k => delete sdS.sessions[k]);
    } catch (e) {}
    const sendEmail = !!(g.email && g.email.to && nx.type === 'lead_created');
    return [{ json: { reply: replyOut, session, logUnanswered: !!query, query, sendEmail, email: g.email || null, log } }];
  }
};
