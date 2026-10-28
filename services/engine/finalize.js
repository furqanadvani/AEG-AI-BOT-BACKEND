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
      // AI #2 na mil saka (limit, ya retry ke baad bhi fail): customer ko "technical masla / 1 minute baad" kabhi nahi.
      // Code khud natural jawab deta hai taake baat chalti rahe.
      const soft = !!(g.aiLimited || g.aiFailed);
      const lk = ['en', 'roman_ur', 'ur'].includes(lang) ? lang : (['ps', 'sd'].includes(lang) ? 'ur' : (lang === 'ar' ? 'ar' : 'en'));
      const pick = arr => arr[(Number(state.turns) || 0) % arr.length]; // har dafa ek jaisa nahi
      const T = {
        en: { ref: 'Your reference number is ', again: 'Sorry, I didn\'t quite catch that. Could you say it once more?' },
        roman_ur: { ref: 'Aapka reference number hai ', again: 'Maazrat, main aapki baat theek se samajh nahi paayi. Ek dafa phir bata dein?' },
        ur: { ref: 'آپ کا ریفرنس نمبر ہے ', again: 'معذرت، میں آپ کی بات ٹھیک سے سمجھ نہیں پائی۔ ایک دفعہ پھر بتا دیں؟' },
        ar: { ref: 'رقمك المرجعي هو ', again: 'عذرًا، لم أفهم رسالتك جيدًا. هل يمكنك إعادتها؟' } };
      const L = T[lk];
      // Har field ka insani sawal (label "Number of travellers" jaisa robotic nahi)
      const ASK = {
        roman_ur: {
          country: ['Aap kis mulk ka visa lena chahte hain?', 'Kis country jane ka plan hai?'],
          visaType: ['Safar ka maqsad kya hai? Jaise ghoomna, family se milna ya business.', 'Aap wahan kis silsile mein ja rahe hain, ghoomne, family visit ya business?'],
          travellers: ['Kitne log travel karenge? Sirf aap, ya koi aur bhi saath hai?', 'Aap akele ja rahe hain ya family / dost bhi saath honge?'],
          travelDate: ['Taqreeban kab jane ka irada hai? Andaza bhi chalega, jaise "agle mahine".', 'Travel kab tak karna chahte hain? Koi andazan date bata dein.'],
          duration: ['Wahan kitne din rukne ka plan hai?', 'Kitne din ka safar hoga, taqreeban?'],
          fullName: ['Application ke liye aapka poora naam kya hai?', 'Apna poora naam bata dein, jaisa passport par hai?'],
          whatsapp: ['Aapka WhatsApp number kya hai, taake team aap se rabta kar sake?', 'Kis WhatsApp number par team aap se baat kare?'],
          _: l => [`Aur ${l} bata dein?`] },
        en: {
          country: ['Which country are you planning to apply for?', 'Where are you planning to travel?'],
          visaType: ['What\'s the purpose of the trip? For example tourism, visiting family or business.'],
          travellers: ['How many people are travelling? Just you, or someone else too?', 'Will you be travelling alone or with family / friends?'],
          travelDate: ['Roughly when are you planning to travel? An estimate is fine, like "next month".'],
          duration: ['How long do you plan to stay?', 'About how many days will the trip be?'],
          fullName: ['What\'s your full name for the application?', 'Could you share your full name as on your passport?'],
          whatsapp: ['What\'s your WhatsApp number, so our team can reach you?'],
          _: l => [`Could you share your ${String(l).toLowerCase()}?`] },
        ur: {
          country: ['آپ کس ملک کا ویزا لینا چاہتے ہیں؟'],
          visaType: ['سفر کا مقصد کیا ہے؟ جیسے گھومنا، فیملی سے ملنا یا بزنس۔'],
          travellers: ['کتنے لوگ سفر کریں گے؟ صرف آپ، یا کوئی اور بھی ساتھ ہے؟'],
          travelDate: ['تقریباً کب جانے کا ارادہ ہے؟ اندازہ بھی چلے گا، جیسے "اگلے مہینے"۔'],
          duration: ['وہاں کتنے دن رکنے کا پلان ہے؟'],
          fullName: ['درخواست کے لیے آپ کا پورا نام کیا ہے؟'],
          whatsapp: ['آپ کا واٹس ایپ نمبر کیا ہے، تاکہ ٹیم آپ سے رابطہ کر سکے؟'],
          _: l => [`اپنا ${l} بتا دیں؟`] },
        ar: { _: l => [`من فضلك أرسل ${l}؟`] } };
      // V19: AI na ho tab bhi insani andaaz: abhi mili detail ka chhota sa zikr + naam ("Shukriya Jamal." / "Dubai, theek hai.")
      const first = String((state.data || {}).fullName || '').trim().split(/\s+/)[0] || '';
      const ackFor = () => {
        const sv = (g.plan && g.plan.saved) || []; if (!sv.length) return '';
        const nm = sv.find(x => x.field === 'fullName'), ct = sv.find(x => x.field === 'country'), tr = sv.find(x => x.field === 'travellers'), dp = sv.find(x => x.field === 'departureCity');
        // Kai detail ek saath ("naam Furqan, Dubai jana hai"): naam + country dono ka zikr
        if (nm && ct) return { en: `Thank you, ${first}. ${ct.value}, sounds good.`, roman_ur: `Shukriya ${first}. ${ct.value}, bohat khoob.`, ur: `شکریہ ${first}۔ ${ct.value}، بہت خوب۔`, ar: 'شكرًا.' }[lk] || `Thank you, ${first}.`;
        if (dp && !nm && !ct && !tr) return { en: `Travelling from ${dp.value}, noted.`, roman_ur: `${dp.value} se, theek hai.`, ur: `${dp.value} سے، ٹھیک ہے۔`, ar: 'حسنًا.' }[lk] || '';
        const A = {
          en: nm ? `Thank you, ${first}.` : ct ? `${ct.value}, sounds good.` : tr ? (String(tr.value) === '1' ? 'Got it, just you.' : `Got it, ${tr.value} travellers.`) : 'Thank you.',
          roman_ur: nm ? `Shukriya ${first}.` : ct ? `${ct.value}, theek hai.` : tr ? (String(tr.value) === '1' ? 'Theek hai, aap akele.' : `Theek hai, ${tr.value} log.`) : 'Shukriya.',
          ur: nm ? `شکریہ ${first}۔` : ct ? `${ct.value}، ٹھیک ہے۔` : tr ? (String(tr.value) === '1' ? 'ٹھیک ہے، آپ اکیلے۔' : `ٹھیک ہے، ${tr.value} افراد۔`) : 'شکریہ۔',
          ar: 'شكرًا.' };
        return A[lk] || A.en;
      };
      const askFor = (field, label) => { const A = ASK[lk] || ASK.en; const q = pick(A[field] || A._(label)); const o = Array.isArray(nx.options) ? nx.options : []; return (!A[field] && o.length) ? `${q}\n${o.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : q; };
      if (nx.type === 'lead_created') {
        // V19: sirf reference number nahi, poora professional jawab
        const LC = { en: `Thank you${first ? ', ' + first : ''}! Your application has been submitted. Your reference number is ${nx.referenceId}. Our consultant will contact you on WhatsApp shortly.`,
          roman_ur: `Shukriya${first ? ' ' + first : ''}! Aapki application jama ho gayi hai. Aapka reference number ${nx.referenceId} hai. Hamare consultant jald WhatsApp par aap se rabta karenge.`,
          ur: `شکریہ${first ? ' ' + first : ''}! آپ کی درخواست جمع ہو گئی ہے۔ آپ کا ریفرنس نمبر ${nx.referenceId} ہے۔ ہمارے کنسلٹنٹ جلد واٹس ایپ پر آپ سے رابطہ کریں گے۔` };
        reply = LC[lk] || `${L.ref}${nx.referenceId}.`;
      }
      else if (nx.type === 'duplicate') reply = `${L.ref}${nx.referenceId}.`;
      else if (nx.type === 'ask_field') reply = [ackFor(), askFor(nx.field, nx.label)].filter(Boolean).join(' ');
      else if (['refused_ask', 'refused_lead_created', 'refused_dropped', 'lead_failed', 'query_failed', 'help', 'offer_apply', 'answer_only', 'welcome'].includes(nx.type) && !(g.plan && g.plan.question && nx.type !== 'refused_ask')) {
        // V19: refused demand + baqi aam jawab bhi bina AI ke professional (kabhi "technical issue" nahi)
        const tk = lk === 'ar' ? 'en' : lk;
        const ph = String((rt.cfg && rt.cfg.settings && rt.cfg.settings.SupportPhone) || '').trim();
        const hl = { en: ph ? `our helpline ${ph}` : 'our helpline', roman_ur: ph ? `hamari helpline ${ph}` : 'hamari helpline', ur: ph ? `ہماری ہیلپ لائن ${ph}` : 'ہماری ہیلپ لائن' }[tk];
        const what = nx.kind === 'country' ? `${nx.country || ''} visa` : `${nx.visaType || ''} visa`;
        const askWord = { fullName: { en: 'your full name', roman_ur: 'apna poora naam', ur: 'اپنا پورا نام' }, whatsapp: { en: 'your WhatsApp number', roman_ur: 'apna WhatsApp number', ur: 'اپنا واٹس ایپ نمبر' } }[nx.field] || { en: 'your details', roman_ur: 'apni details', ur: 'اپنی تفصیلات' };
        const N = {
          refused_ask: {
            en: nx.field === 'whatsapp' && !nx.first ? `Thank you${first ? ', ' + first : ''}. Could you share ${askWord.en}, so our team can reach you about your ${what} requirement?` : `${nx.kind === 'visa' && nx.first && !g.prefixReply ? `We don't process ${what}s at the moment. ` : ''}We'd still like to note your requirement so our team can guide you. Could you share ${askWord.en}?`,
            roman_ur: nx.field === 'whatsapp' && !nx.first ? `Shukriya${first ? ' ' + first : ''}. Apna WhatsApp number bhi share kar dein, taake hamari team aapki ${what} ki requirement ke silsile mein aap se rabta kar sake.` : `${nx.kind === 'visa' && nx.first && !g.prefixReply ? `Filhaal hum ${what} process nahi karte. ` : ''}Lekin hum aapki requirement note kar lena chahte hain taake hamari team aapki rehnumai kar sake. Kya aap ${askWord.roman_ur} share kar denge?`,
            ur: nx.field === 'whatsapp' && !nx.first ? `شکریہ${first ? ' ' + first : ''}۔ اپنا واٹس ایپ نمبر بھی بتا دیں، تاکہ ہماری ٹیم آپ سے رابطہ کر سکے۔` : `${nx.kind === 'visa' && nx.first && !g.prefixReply ? `فی الحال ہم ${what} پراسیس نہیں کرتے۔ ` : ''}لیکن ہم آپ کی ضرورت نوٹ کرنا چاہتے ہیں تاکہ ہماری ٹیم آپ کی رہنمائی کر سکے۔ کیا آپ ${askWord.ur} بتا دیں گے؟` },
          refused_lead_created: {
            en: `Thank you${first ? ', ' + first : ''}. Your ${what} requirement has been noted${nx.referenceId ? ' (reference ' + nx.referenceId + ')' : ''}. For further information and guidance, please contact ${hl}. If you need a visa for any other country, I'm happy to help.`,
            roman_ur: `Shukriya${first ? ' ' + first : ''}. Aapki ${what} ki requirement note kar li gayi hai${nx.referenceId ? ' (reference ' + nx.referenceId + ')' : ''}. Mazeed maloomat aur rehnumai ke liye aap ${hl} se rabta kar sakte hain. Kisi aur mulk ka visa chahiye ho to main madad ke liye hazir hoon.`,
            ur: `شکریہ${first ? ' ' + first : ''}۔ آپ کی ${what} کی ضرورت نوٹ کر لی گئی ہے${nx.referenceId ? ' (ریفرنس ' + nx.referenceId + ')' : ''}۔ مزید معلومات اور رہنمائی کے لیے آپ ${hl} سے رابطہ کر سکتے ہیں۔ کسی اور ملک کا ویزا چاہیے ہو تو میں مدد کے لیے حاضر ہوں۔` },
          refused_dropped: {
            en: `No problem at all. For further information you can contact ${hl} anytime, and I'm happy to help with a visa for any other country.`,
            roman_ur: `Koi baat nahi. Mazeed maloomat ke liye aap kabhi bhi ${hl} se rabta kar sakte hain, aur kisi aur mulk ke visa ke liye hum hamesha haazir hain.`,
            ur: `کوئی بات نہیں۔ مزید معلومات کے لیے آپ کبھی بھی ${hl} سے رابطہ کر سکتے ہیں، اور کسی اور ملک کے ویزا میں ہم خوشی سے مدد کریں گے۔` },
          lead_failed: { en: 'Your details are safely with us. Please reply "Confirm" once more and I\'ll complete the submission.', roman_ur: 'Aapki details hamare paas mehfooz hain. Submission mukammal karne ke liye bas ek dafa phir "Confirm" likh dein.', ur: 'آپ کی تفصیلات ہمارے پاس محفوظ ہیں۔ جمع کروانے کے لیے بس ایک دفعہ پھر "Confirm" لکھ دیں۔' },
          query_failed: { en: 'Thank you, I\'ve noted your message and our team will follow up with you shortly.', roman_ur: 'Shukriya, aapka message note kar liya hai. Hamari team jald aap se rabta karegi.', ur: 'شکریہ، آپ کا پیغام نوٹ کر لیا ہے۔ ہماری ٹیم جلد آپ سے رابطہ کرے گی۔' },
          help: { en: `I'm here to help${first ? ', ' + first : ''}. Which country are you planning to travel to?`, roman_ur: `Ji, main madad ke liye hazir hoon${first ? ' ' + first : ''}. Aap kis mulk ka safar plan kar rahe hain?`, ur: `جی، میں مدد کے لیے حاضر ہوں۔ آپ کس ملک کا سفر پلان کر رہے ہیں؟` },
        };
        N.offer_apply = N.help; N.answer_only = N.help; N.welcome = N.help;
        // V19.1: help / offer par bhi wahi agla sawal jo Guard ne chuna (pehle hamesha "kis mulk" aata tha, chahe country mil chuki ho)
        if (['help', 'offer_apply', 'answer_only'].includes(nx.type) && nx.field) reply = [ackFor(), askFor(nx.field, nx.label)].filter(Boolean).join(' ');
        else reply = (N[nx.type] && (N[nx.type][tk] || N[nx.type].en)) || L.again;
      }
      else if (soft && ['confirm_phone', 'confirm_summary', 'status_result', 'status_ask', 'status_not_found'].includes(nx.type)) {
        // Seedhe templates, taake customer application / status poora kar sake
        const tk = lk === 'ar' ? 'en' : lk;
        const sum = (g.summary || []).filter(x => x.value).map(x => `- ${x.label}: ${/^\+\d{10,15}$/.test(String(x.value)) ? prettyPhone(x.value) : x.value}`).join('\n');
        const N = {
          confirm_phone: { en: `Just to confirm, is this your WhatsApp number: ${nx.number}?`, roman_ur: `Bas confirm kar lein, kya yeh aapka WhatsApp number hai: ${nx.number}?`, ur: `بس تصدیق کر لیں، کیا یہ آپ کا واٹس ایپ نمبر ہے: ${nx.number}؟` },
          confirm_summary: { en: `Here are your details:\n${sum}\n\nIf everything looks right, just reply "Confirm". Or tell me what to change.`, roman_ur: `Yeh rahi aapki details:\n${sum}\n\nSab theek hai to bas "Confirm" likh dein, warna bata dein kya badalna hai.`, ur: `یہ رہیں آپ کی تفصیلات:\n${sum}\n\nسب درست ہو تو بس "Confirm" لکھ دیں، ورنہ بتائیں کیا تبدیل کرنا ہے۔` },
          status_result: { en: `Reference ${nx.referenceId}: ${nx.country} ${nx.visaType} visa, status: ${nx.status} (updated ${nx.lastUpdated}).`, roman_ur: `Reference ${nx.referenceId}: ${nx.country} ${nx.visaType} visa, status: ${nx.status} (updated ${nx.lastUpdated}).`, ur: `ریفرنس ${nx.referenceId}: ${nx.country} ${nx.visaType} ویزا، اسٹیٹس: ${nx.status} (${nx.lastUpdated})۔` },
          status_ask: { en: 'Sure. Please send your reference number (like AEG-XXXX) and the WhatsApp number used in the application.', roman_ur: 'Zaroor. Apna reference number (jaise AEG-XXXX) aur application wala WhatsApp number bhej dein.', ur: 'ضرور۔ اپنا ریفرنس نمبر (جیسے AEG-XXXX) اور درخواست والا واٹس ایپ نمبر بھیج دیں۔' },
          status_not_found: { en: 'I couldn\'t find an application with these details. Could you double-check the reference and WhatsApp number?', roman_ur: 'In details se koi application nahi mili. Reference aur WhatsApp number ek dafa check kar lein?', ur: 'ان تفصیلات سے کوئی درخواست نہیں ملی۔ ریفرنس اور واٹس ایپ نمبر ایک دفعہ چیک کر لیں؟' },
        };
        reply = N[nx.type][tk];
      }
      else if (g.aiLimited || (soft && g.plan && g.plan.question)) {
        // Customer ka sawal tha ya AI limit: team ko note, customer ko tasalli
        const B = { en: 'Thanks for your message. I\'ve noted it and our team will get back to you shortly.', roman_ur: 'Aapka message note kar liya hai, shukriya. Hamari team jald aap se rabta karegi.', ur: 'آپ کا پیغام نوٹ کر لیا ہے، شکریہ۔ ہماری ٹیم جلد آپ سے رابطہ کرے گی۔', ar: 'شكرًا لرسالتك. سيتواصل معك فريقنا قريبًا.' };
        reply = B[lk] || B.en;
      }
      else reply = L.again;
    }
    // Agla sawal reh gaya ho (sirf "samajh gaya" likha) to khud jor do, taake baat atke nahi
    // V19.2: AI ne masla samjha kar wahi detail maang li ho ("03XX format mein de dein.") to dobara sawal nahi jorna
    const askedAlready = ((g.plan && g.plan.issues) || []).some(i => i.field === nx.field) || /\b(de dein|bata dein|bhej dein|share kar|likh dein|please (send|share|provide)|could you)\b/i.test(reply);
    if (replyAiOk && nx.type === 'ask_field' && !askedAlready && !/[?\u061F]/.test(reply) && !/(^|\n)\s*\d+[.)]\s/.test(reply)) {
      const Q = { en: ['Could you please share your ', '?'], roman_ur: ['Barah-e-karam apna ', ' bata dein?'], ur: ['براہ کرم اپنا ', ' بتا دیں؟'], ar: ['من فضلك أرسل ', '؟'] }[lang] || ['Could you please share your ', '?'];
      reply = reply.replace(/\s+$/, '') + '\n' + Q[0] + (lang === 'en' ? String(nx.label || '').toLowerCase() : nx.label) + Q[1]; // sheet ka andar wala "WhatToAsk" text kabhi customer ko nahi
    }
    // V19.1: AI na ho aur jawab bilkul pichle jaisa ban jaye to alag andaaz ("wahi line dobara" robotic lagti hai)
    if (!replyAiOk && (nx.type === 'ask_field' || nx.field)) {
      const lastBot = ((g.history || []).filter(h => h.role === 'assistant').pop() || {}).text || '';
      if (lastBot && String(lastBot).trim() === String(reply).trim()) {
        const lk2 = ['en', 'roman_ur', 'ur'].includes(lang) ? lang : 'en';
        const R = { en: 'Sorry if I wasn\'t clear. ', roman_ur: 'Maazrat, shayad main theek se pooch nahi paayi. ', ur: 'معذرت، شاید میں ٹھیک سے پوچھ نہیں پائی۔ ' }[lk2];
        const hint = { country: { en: 'Which country would you like to travel to, for example UAE or Saudi Arabia?', roman_ur: 'Aap kis mulk jana chahte hain, jaise UAE ya Saudi Arabia?', ur: 'آپ کس ملک جانا چاہتے ہیں، جیسے یو اے ای یا سعودی عرب؟' } }[nx.field];
        reply = R + ((hint && hint[lk2]) || reply);
      }
    }
    if (g.prefixReply) reply = String(g.prefixReply).trim() + '\n\n' + reply.trim();
    state.lastNext = nx.type || null;
    // V19.2: Hindi alfaaz ka safety net (Pakistani customer ke liye)
    if (['roman_ur', 'ur'].includes(lang)) reply = reply.replace(/\bkripya\b/gi, 'barah-e-karam').replace(/\bkripaya\b/gi, 'barah-e-karam').replace(/\bdhanyavaad\b/gi, 'shukriya').replace(/\bdhanyawad\b/gi, 'shukriya').replace(/\bnamaste\b/gi, 'Assalam o Alaikum');
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
