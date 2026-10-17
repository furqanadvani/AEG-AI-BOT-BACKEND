/**
 * Shared engine helpers (ported 1:1 from n8n workflow V18.8 "shared helpers V18.3").
 * Pehle yeh block 4 Code nodes mein copy tha; ab sirf yahin hai.
 * Koi bhi change yahan karein, saare engine steps ko mil jayega.
 */
// ===== shared helpers V18.3 (yahi block kai Code nodes mein hai; badlein to sab mein badlein) =====
const toAsciiDigits = s => String(s ?? '').replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0)).replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
const norm = s => toAsciiDigits(s).toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}\s+]/gu, ' ').replace(/\s+/g, ' ').trim();
const has = v => v !== undefined && v !== null && String(v).trim() !== '';
const yes = v => /^(yes|y|true|1|haan|han|ji|jee|active|on)$/i.test(String(v ?? '').trim());
const splitList = s => String(s ?? '').split(/[|,;\n]/).map(x => x.trim()).filter(Boolean);
const titleCase = s => s.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
function safeJson(s, d) { try { const v = typeof s === 'string' ? JSON.parse(s) : s; return v ?? d; } catch (e) { return d; } }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function containsTerm(text, term) { const t = norm(term); if (t.length < 2) return false; return (' ' + norm(text) + ' ').includes(' ' + t + ' '); }
function condOk(cond, data) {
  const c = String(cond ?? '').trim();
  if (!c || /^always$/i.test(c)) return true;
  const m = c.match(/^([A-Za-z0-9_]+)\s*(==|=|!=|>=|<=|>|<)\s*(.+)$/);
  if (!m) return true;
  const left = data[m[1]]; const right = m[3].trim().replace(/^['"]|['"]$/g, '');
  if (!has(left)) return false;
  const ln = Number(left), rn = Number(right); const num = !isNaN(ln) && !isNaN(rn);
  const a = num ? ln : norm(left), b = num ? rn : norm(right);
  return { '==': a == b, '=': a == b, '!=': a != b, '>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b }[m[2]];
}
function resolveCountry(cfg, val) {
  const n = norm(val); if (!n) return null;
  for (const c of cfg.countries) {
    if (norm(c.name) === n || c.aliases.some(a => norm(a) === n)) return { country: c, city: null };
    const city = c.cities.find(x => norm(x) === n); if (city) return { country: c, city };
  }
  for (const c of cfg.countries) {
    for (const t of [c.name, ...c.aliases, ...c.cities]) {
      if (norm(t).length >= 3 && containsTerm(n, t)) return { country: c, city: c.cities.find(x => norm(x) === norm(t)) || null };
    }
  }
  return null;
}
function visaRows(cfg, country) {
  const cn = norm(country);
  const rows = cfg.visaTypes.filter(v => norm(v.country) === 'all' || (cn && norm(v.country) === cn));
  const byName = {};
  for (const r of rows) { const k = norm(r.name); if (!byName[k] || norm(r.country) !== 'all') byName[k] = r; }
  return Object.values(byName);
}
function resolveVisa(cfg, val, country) {
  const n = norm(val); if (!n) return null;
  const rows = visaRows(cfg, country);
  for (const r of rows) if ([r.name, ...r.aliases].some(t => norm(t) === n)) return r;
  for (const r of rows) if ([r.name, ...r.aliases].some(t => norm(t).length >= 3 && containsTerm(n, t))) return r;
  return null;
}
function supportedVisaNames(cfg, country) { return visaRows(cfg, country).filter(r => r.action === 'Apply').map(r => r.name); }
function refusedVisaNames(cfg, country) { return visaRows(cfg, country).filter(r => r.action === 'Refuse').map(r => r.name); }
function activeCountries(cfg) { return cfg.countries.filter(c => c.active).map(c => c.name); }
function pickQuestions(cfg, data) {
  const c = norm(data.country), v = norm(data.visaType);
  const best = {};
  for (const r of cfg.questions) {
    if (!r.active || !r.field) continue;
    const rc = norm(r.country || 'all'), rv = norm(r.visaType || 'all');
    const cm = rc === 'all' ? 1 : (rc === c ? 2 : 0), vm = rv === 'all' ? 1 : (rv === v ? 2 : 0);
    if (!cm || !vm) continue;
    const s = cm * 10 + vm;
    if (!best[r.field] || s > best[r.field].s) best[r.field] = { s, r };
  }
  const out = Object.values(best).map(x => x.r).filter(r => r.required && condOk(r.askWhen, data)).sort((a, b) => a.order - b.order);
  // Country hamesha pehla sawal (sheet mein order kuch bhi ho, ya row na ho)
  const ci = out.findIndex(r => r.field === 'country');
  if (ci > 0) out.unshift(out.splice(ci, 1)[0]); else if (ci < 0) out.unshift(fieldDefFor(cfg, data, 'country'));
  return out;
}
function fieldDefFor(cfg, data, field) {
  const c = norm(data.country), v = norm(data.visaType); let best = null, bs = -1, any = null;
  for (const r of cfg.questions) {
    if (!r.active || r.field !== field) continue;
    if (!any) any = r;
    const rc = norm(r.country || 'all'), rv = norm(r.visaType || 'all');
    const cm = rc === 'all' ? 1 : (rc === c ? 2 : 0), vm = rv === 'all' ? 1 : (rv === v ? 2 : 0);
    if (!cm || !vm) continue; const s = cm * 10 + vm; if (s > bs) { bs = s; best = r; }
  }
  if (best) return best;
  if (field === 'country') return { field, label: 'Country', type: 'country', options: '', order: 1 };
  if (field === 'visaType') return { field, label: 'Visa type', type: 'visatype', options: '', order: 2 };
  if (field === 'fullName') return { field, label: 'Full name', type: 'name', options: '', order: 90 };
  if (field === 'whatsapp') return { field, label: 'WhatsApp', type: 'phone', options: '', order: 91 };
  return any;
}
// AI #1 ko sirf woh fields jo is customer ke liye relevant hain (tokens bachte hain)
function relevantFieldDefs(cfg, data) {
  const names = []; const c = norm(data.country), v = norm(data.visaType);
  for (const r of cfg.questions) {
    if (!r.active || !r.field || names.includes(r.field)) continue;
    const rc = norm(r.country || 'all'), rv = norm(r.visaType || 'all');
    if ((rc === 'all' || !c || rc === c) && (rv === 'all' || !v || rv === v)) names.push(r.field);
  }
  for (const f of ['country', 'visaType', 'fullName', 'whatsapp']) if (!names.includes(f)) names.push(f);
  return names.map(f => fieldDefFor(cfg, data, f)).filter(Boolean).sort((a, b) => (a.order || 999) - (b.order || 999));
}
function normPhone(v) {
  let d = toAsciiDigits(v).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('03') && d.length === 11) d = '92' + d.slice(1);
  else if (d.startsWith('3') && d.length === 10) d = '92' + d;
  if (d.startsWith('92')) return (d.length === 12 && d[2] === '3') ? '+' + d : null;
  if (d.startsWith('0')) return null;
  return (d.length >= 10 && d.length <= 15) ? '+' + d : null;
}
function prettyPhone(p) { const s = String(p || ''); const m = s.match(/^\+92(3\d{2})(\d{3})(\d{4})$/); return m ? `0${m[1]} ${m[2]} ${m[3]}` : s; }
const YES_RE = /^(yes|y|yeah|yep|yup|ok yes|haan|han|haa|ha|hn|ji|jee|g|ji haan|jee haan|ji han|jee han|bilkul|zaroor|hai|haan hai|ji hai|jee hai|ہاں|جی|جی ہاں|ہاں جی|بالکل|نعم|اجل|هو|ہو|او)$/i;
const NO_RE = /^(no|n|nope|nah|nahi|nahin|nai|nhi|nh|na|ji nahi|jee nahi|nahi hai|nhi hai|نہیں|نہ|جی نہیں|لا|نه|نشته)$/i;
function matchChoice(options, v) {
  const opts = splitList(options); const nv = norm(v); if (!nv || !opts.length) return null;
  let hit = opts.find(o => norm(o) === nv); if (hit) return hit;
  if (/^\d{1,2}$/.test(nv) && +nv >= 1 && +nv <= opts.length) return opts[+nv - 1]; // "2" = doosra option
  const yesOpt = opts.find(o => /^(yes|haan|ji)\b/i.test(norm(o))), noOpt = opts.find(o => /^(no|nahi)\b/i.test(norm(o)));
  if (YES_RE.test(nv) && yesOpt) return yesOpt;
  if (NO_RE.test(nv) && noOpt) return noOpt;
  hit = opts.find(o => norm(o).length >= 3 && (nv.startsWith(norm(o)) || (nv.length >= 3 && norm(o).startsWith(nv))));
  return hit || null;
}
const NOT_NAME = /\b(visa|apply|status|track|chahiye|chaiye|chahye|karna|karni|krna|hai|haai|hain|mujhe|mujhy|mjhy|mera|meri|naam|kya|kia|nahi|nh|nahin|batao|help|ok|okay|yes|no|haan|jee|ji|please|want|need|dubai|uae|country|tourist|business|number|whatsapp|team|agent)\b/i;
// ===== Travel date engine V18.3 (customer ki date ko agle aane wale din/mahine par le jata hai) =====
// "18 may" -> agar 18 May is saal guzar chuki to agle saal ki 18 May. "aug" -> agar August guzar chuka to agle saal ka.
// Customer khud saal likhe aur woh date guzar chuki ho (18 May 2026) -> reject + agle saal ki date suggest.
const TD_MONTHS = [
  ['january', 'jan', 'janwari', 'janvari', 'januari', 'جنوری'],
  ['february', 'feb', 'febuary', 'feburary', 'farwari', 'farvari', 'febrauary', 'فروری'],
  ['march', 'mar', 'march', 'mrch', 'مارچ'],
  ['april', 'apr', 'aprail', 'aprel', 'aprl', 'اپریل'],
  ['may', 'mayi', 'مئی', 'مئ'],
  ['june', 'jun', 'joon', 'جون'],
  ['july', 'jul', 'julai', 'jully', 'جولائی', 'جولائ'],
  ['august', 'aug', 'agust', 'agast', 'augest', 'augst', 'اگست'],
  ['september', 'sep', 'sept', 'septmber', 'sitambar', 'sitamber', 'ستمبر'],
  ['october', 'oct', 'octuber', 'aktubar', 'october', 'اکتوبر'],
  ['november', 'nov', 'novmber', 'nawambar', 'navambar', 'نومبر'],
  ['december', 'dec', 'decmber', 'disambar', 'dismbar', 'دسمبر']];
const TD_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TD_ALT = TD_MONTHS.flat().sort((a, b) => b.length - a.length).join('|');
const TD_AMBIG = ['may', 'mar', 'jan']; // akele aayein to month ho bhi sakta hai, nahi bhi ("I may", "jan")
const tdMonth = w => TD_MONTHS.findIndex(a => a.includes(String(w).toLowerCase())) + 1;
const tdDays = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const tdIso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const tdYear = y => { y = +y; return y < 100 ? 2000 + y : y; };
const NB = '(?<![\\p{L}\\p{N}])', NA = '(?![\\p{L}\\p{N}])', ORD = '(?:st|nd|rd|th)?';
function friendlyDate(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${+m[3]} ${TD_NAMES[+m[2] - 1]} ${m[1]}` : String(v || '');
}
// Text mein se date ka hissa dhoondta hai. Kuch na mile to null.
function findDateExpr(text) {
  const t = toAsciiDigits(String(text || '')).toLowerCase().replace(/!(?=\d)/g, '1'); // "!5-nov" = 15-nov (Shift+1)
  let m;
  // 1) 2027-05-18
  if ((m = t.match(new RegExp(NB + '(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})' + NA, 'u')))) return { kind: 'day', y: +m[1], mo: +m[2], d: +m[3], yearGiven: true };
  // 2) 18 may / 18th of May 2027 / 19-aug-27
  if ((m = t.match(new RegExp(NB + '(\\d{1,2})' + ORD + '\\s*(?:of\\s+)?[-/., ]*\\s*(' + TD_ALT + ')' + NA + '(?:\\s*[-/.,\']?\\s*(\\d{4})' + NA + '|[-/\'](\\d{2})' + NA + ')?', 'u'))))
    return { kind: 'day', mo: tdMonth(m[2]), d: +m[1], y: m[3] ? +m[3] : (m[4] ? tdYear(m[4]) : null), yearGiven: !!(m[3] || m[4]) };
  // 3) may 18 / August 19th, 2027
  if ((m = t.match(new RegExp(NB + '(' + TD_ALT + ')\\s*[-/.,]?\\s*(\\d{1,2})' + ORD + NA + '(?:\\s*[-/.,]?\\s*(\\d{4})' + NA + ')?', 'u'))))
    return { kind: 'day', mo: tdMonth(m[1]), d: +m[2], y: m[3] ? +m[3] : null, yearGiven: !!m[3] };
  // 4) 18/5, 18-05-2027, 18.05.2027 (Pakistan style: din pehle). "2.5 lakh" na pakre isliye "." sirf saal ke saath
  for (const x of t.matchAll(/(?<![\d.])(\d{1,2})(?:[-/](\d{1,2})(?:[-/](\d{4}|\d{2}))?|\.(\d{1,2})\.(\d{4}|\d{2}))(?![\d.])/g)) {
    const d = +x[1], mo = +(x[2] || x[4]), yr = x[3] || x[5];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { kind: 'day', mo, d, y: yr ? tdYear(yr) : null, yearGiven: !!yr };
  }
  // 5) "18 tareekh ko" (mahina nahi bataya)
  if ((m = t.match(/(?<!\d)(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:tareekh|tarikh|tareek|tarik|تاریخ|date)(?![\p{L}])/u)) && +m[1] >= 1 && +m[1] <= 31) return { kind: 'dom', d: +m[1] };
  // 6) aaj / kal / parson / agle mahine / is mahine
  if (/(?<![\p{L}])(day after tomorrow|parson|parso|پرسوں)(?![\p{L}])/u.test(t)) return { kind: 'rel', days: 2 };
  if (/(?<![\p{L}])(tomorrow|kal|کل)(?![\p{L}])/u.test(t)) return { kind: 'rel', days: 1 };
  if (/(?<![\p{L}])(today|aaj|aj|آج)(?![\p{L}])/u.test(t)) return { kind: 'rel', days: 0 };
  if (/(next month|agle mahine|aglay mahinay|agle mahinay|agly mahiny|agle month|aglay month|اگلے مہینے)/u.test(t)) return { kind: 'relmonth', add: 1 };
  if (/(this month|is mahine|isi mahine|is month|isi month|اسی مہینے|اس مہینے)/u.test(t)) return { kind: 'relmonth', add: 0 };
  // 7) sirf mahina: "august", "aug 2027", "december mein"
  const words = t.split(/\s+/).filter(Boolean).length;
  for (const x of t.matchAll(new RegExp(NB + '(' + TD_ALT + ')' + NA + '(?:\\s*[-/,\']?\\s*(\\d{4})' + NA + ')?', 'gu'))) {
    const w = x[1];
    if (TD_AMBIG.includes(w) && !x[2] && words > 3 && !new RegExp('(in|of|mein|me|mai|ke|ki|se|till|by|during|end|start|shuru|akhir|month|mahine)\\s+' + w + NA + '|' + w + '\\s+(mein|me|mai|ke|ki|month|mahine|end|tak)' + NA, 'u').test(t)) continue;
    return { kind: 'month', mo: tdMonth(w), y: x[2] ? +x[2] : null, yearGiven: !!x[2] };
  }
  return null;
}
// Faisla: { ok, value, reason, detail, suggestion, rolled }   (null = text mein koi date nahi)
function resolveTravelDate(text, todayIso, S) {
  const e = findDateExpr(text); if (!e) return null;
  S = S || {};
  const [ty, tm, td] = String(todayIso).split('-').map(Number);
  const maxM = Number(S.MaxTravelMonthsAhead) || 24, minD = Number(S.MinTravelDaysAhead) || 0;
  const shift = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
  const minIso = shift(ty, tm, td + minD), maxIso = shift(ty, tm + maxM, td);
  const tooFar = { ok: false, reason: 'date_too_far', detail: `${maxM} months` };
  const dayResult = (iso, rolled) => iso > maxIso ? tooFar : iso < minIso ? { ok: false, reason: 'date_too_soon', detail: friendlyDate(minIso) } : { ok: true, value: iso, rolled: !!rolled };
  // Agla aane wala din (saal khud tay)
  const nextDay = (mo, d) => {
    if (d > 31 || d < 1 || mo < 1 || mo > 12 || d > (mo === 2 ? 29 : tdDays(2001, mo))) return null;
    for (let y = ty; y <= ty + 8; y++) { if (d <= tdDays(y, mo) && tdIso(y, mo, d) >= minIso) return { iso: tdIso(y, mo, d), rolled: y !== ty }; }
    return null;
  };
  if (e.kind === 'rel') return dayResult(shift(ty, tm, td + e.days), false);
  if (e.kind === 'dom') {
    for (let k = 0; k < 4; k++) { const y = ty + Math.floor((tm - 1 + k) / 12), mo = ((tm - 1 + k) % 12) + 1; if (e.d <= tdDays(y, mo) && tdIso(y, mo, e.d) >= minIso) return dayResult(tdIso(y, mo, e.d), k > 0); }
    return { ok: false, reason: 'invalid_date' };
  }
  if (e.kind === 'day') {
    if (!e.yearGiven) { const n = nextDay(e.mo, e.d); return n ? dayResult(n.iso, n.rolled) : { ok: false, reason: 'invalid_date' }; }
    if (e.mo < 1 || e.mo > 12 || e.d < 1 || e.d > tdDays(e.y, e.mo)) return { ok: false, reason: 'invalid_date' };
    const iso = tdIso(e.y, e.mo, e.d);
    if (iso < todayIso) return { ok: false, reason: 'date_in_past', detail: '' }; // V18.8: guzri hui date: koi suggestion nahi, sirf sahi date maangni hai
    return dayResult(iso, false);
  }
  // Mahina
  let y, mo;
  if (e.kind === 'relmonth') { y = ty + Math.floor((tm - 1 + e.add) / 12); mo = ((tm - 1 + e.add) % 12) + 1; }
  else if (!e.yearGiven) { mo = e.mo; y = mo < tm ? ty + 1 : ty; }
  else {
    mo = e.mo; y = e.y;
    if (y * 12 + mo < ty * 12 + tm) return { ok: false, reason: 'date_in_past', detail: '' };
  }
  if (tdIso(y, mo, 1) > maxIso) return tooFar;
  return { ok: true, value: `${TD_NAMES[mo - 1]} ${y}`, rolled: !e.yearGiven && y !== ty };
}
// Date ke bajaye plan wale alfaaz ("flexible", "eid ke baad", "jaldi") qabool, baqi (jaise "haan", "ok") nahi
const FLEX_DATE_RE = /(flexib|flex|not sure|pata nahi|pata nhi|sure nahi|sure nhi|decide|jaldi|jald|asap|soon|urgent|foran|fori|week|hafte|hafta|haftay|eid|ramzan|ramadan|ramazan|hajj|umrah|summer|winter|spring|garmi|sardi|chutti|holiday|vacation|baad|after|before|pehle|pehly|end|start|shuru|akhir|mahine|mahina|month|saal|year|din|days|عید|رمضان|جلد|بعد|پہلے|ہفت|مہین)/i;
// ===== end travel date engine =====
function validateField(cfg, data, def, value) {
  const S = cfg.settings || {}; const v = String(value ?? '').trim();
  switch (def.type) {
    case 'country': {
      const r = resolveCountry(cfg, v);
      if (r && r.country.active) return { ok: true, value: r.country.name };
      return { ok: false, reason: 'unsupported_country', detail: r ? r.country.name : v.slice(0, 40) };
    }
    case 'visatype': {
      const r = resolveVisa(cfg, v, data.country);
      // Business rule: sirf VisaTypes mein Action = Refuse wale mana; list mein na ho to qabool (Settings se Refuse/Forward kiya ja sakta hai)
      const act = r ? r.action : (['Refuse', 'Forward'].includes(S.UnknownVisaTypeAction) ? S.UnknownVisaTypeAction : 'Apply');
      const name = r ? r.name : titleCase(v.slice(0, 40));
      if (act === 'Apply') return { ok: true, value: name };
      return { ok: false, reason: act === 'Refuse' ? 'refused_visa_type' : 'forward_visa_type', detail: r ? name : v.slice(0, 60), note: r ? r.note : '', unknown: !r };
    }
    case 'name': {
      let n = v.replace(/^(mera naam|my name is|name is|naam|i am|i'm|main)\s+/i, '').replace(/\s+(hai|he|hy|haai|hoon|hun|hu)\.?$/i, '').trim();
      const words = n.split(/\s+/).filter(Boolean);
      if (/\d/.test(n) || n.length < 2 || n.length > 60 || words.length > 5 || !/^[\p{L}\p{M} .'-]+$/u.test(n) || NOT_NAME.test(n)) return { ok: false, reason: 'not_a_name' };
      return { ok: true, value: /^[a-z .'-]+$/.test(n) ? titleCase(n) : n };
    }
    case 'phone': { const p = normPhone(v); return p ? { ok: true, value: p } : { ok: false, reason: 'invalid_phone' }; }
    case 'number': {
      const m = toAsciiDigits(v).match(/\d+/); if (!m) return { ok: false, reason: 'not_a_number' };
      const n = parseInt(m[0], 10); const rg = String(def.options || '').match(/(\d+)\s*-\s*(\d+)/);
      const min = rg ? +rg[1] : 1, max = rg ? +rg[2] : 99;
      return (n >= min && n <= max) ? { ok: true, value: String(n) } : { ok: false, reason: 'out_of_range', detail: `${min}-${max}` };
    }
    case 'choice': {
      const hit = matchChoice(def.options, v);
      return hit ? { ok: true, value: hit } : { ok: false, reason: 'not_in_options', detail: splitList(def.options).join(' / ') };
    }
    case 'date': {
      const raw = v.slice(0, 80);
      const r = resolveTravelDate(raw, pkToday(), S);
      if (r) return r.ok ? { ok: true, value: r.value, rolled: !!r.rolled } : r;
      const n = norm(raw);
      if (!n || YES_RE.test(n) || NO_RE.test(n) || !FLEX_DATE_RE.test(raw)) return { ok: false, reason: 'unclear_date' };
      return { ok: true, value: raw.slice(0, 40) };
    }
    case 'duration': return /\d|week|month|day|year|din|hafta|hafte|mahina|mahine|saal|flexible|sure|دن|ہفت|مہین|سال/i.test(toAsciiDigits(v)) ? { ok: true, value: v.slice(0, 40) } : { ok: false, reason: 'unclear_duration' };
    default: return (v.length >= 1 && v.length <= 150) ? { ok: true, value: v } : { ok: false, reason: 'too_long' };
  }
}
function detectLang(t) {
  const s = String(t || '');
  if (/[\u0600-\u06FF]/.test(s)) {
    if (/[ټډړښږځڅېۍ]/.test(s)) return 'ps';
    if (/[ڄڃڇڊڌڍڏڙڦڱڻٻٺٽ]/.test(s)) return 'sd';
    if (/[ٹڈڑںےۓ]/.test(s)) return 'ur';
    if (/[ةىكي]/.test(s)) return 'ar';
    return 'ur';
  }
  if (/\b(mujhe|mujhy|mjhy|mjhe|chahiye|chaiye|chahye|kya|kia|hai|haai|hain|hy|mera|meri|mere|hum|aap|ap|nahi|nh|nhi|karna|krna|batao|btao|bataen|liye|lye|jana|kitne|kitna|kitni|kyun|kiyun|q|kaise|kesy|kese|acha|theek|shukriya)\b/i.test(s)) return 'roman_ur';
  if (/\b(i|want|need|please|what|how|visa|apply|my|the|is|can|do|you|thanks|thank)\b/i.test(s)) return 'en';
  return '';
}
// Code ka apna faisla: English ya Roman Urdu alfaaz gin kar (AI ki ghalti pakarne ke liye)
const EN_WORDS = new Set(['i','want','need','my','to','the','a','an','is','are','am','for','please','what','how','can','could','you','your','of','and','apply','check','track','status','previous','pervious','prevoius','application','applications','myself','hello','hi','hey','thanks','thank','yes','no','do','does','have','has','will','would','with','from','when','where','why','which','it','this','that','about','know','tell','let','get','go','going','travel','trip','family','wife','days','week','weeks','month','okay','sure','again','also','just','only','not','dont','don','any','anything','else','there','here','we','our','us','he','she','they','be','been','was','were']);
const RU_WORDS = new Set(['mujhe','mujhy','mjhe','mjhy','mujh','mera','meri','mere','hai','haai','hain','hy','he','ka','ki','ke','ko','se','mein','kya','kia','nahi','nahin','nhi','nh','nhn','karna','krna','karni','chahiye','chaiye','chahye','batao','btao','bata','bataen','aap','ap','apna','apni','apne','hum','humein','liye','lye','kitne','kitna','kitni','kyun','kiyun','kyu','acha','theek','thik','haan','han','jee','ji','bhi','aur','tha','thi','raha','rahi','rahe','kar','dein','den','do','skte','sakte','sakta','haina','wala','wali','kab','kahan','kaise','kese','kesy','abhi','pehle','pichli','shukriya','bas','yaar']);
function latinLangVote(t) {
  const w = norm(t).split(' ').filter(x => /\p{L}/u.test(x)); if (w.length < 3) return '';
  let en = 0, ru = 0; for (const x of w) { if (EN_WORDS.has(x)) en++; if (RU_WORDS.has(x)) ru++; }
  if (ru >= 2 && ru >= en) return 'roman_ur';
  if (en >= 2 && ru === 0) return 'en';
  return '';
}
// "nahi", "no thanks", "bas", "shukriya": customer ko aur kuch nahi chahiye
const CLOSING_RE = /^(no|nope|nah|nahi|nahin|nai|nhi|nh|nhn|na|no thanks|no thank you|no thanks bas|nahi shukriya|nhi shukriya|nh shukriya|nh thanks|nhi thanks|nahi thanks|bas|bas shukriya|bas thanks|nahi bas|kuch nahi|kuch nhi|nothing|nothing else|thats all|that s all|thanks|thank you|thankyou|thx|ty|shukriya|shukria|ok|okay|ok thanks|ok thank you|okay thanks|ok shukriya|ok thansks|theek hai|thik hai|theek hai shukriya|done|bye|allah hafiz|khuda hafiz|نہیں|شکریہ|بس|نہیں شکریہ|اللہ حافظ|خدا حافظ|لا|شكرا|لا شكرا)$/i;
const isClosing = t => CLOSING_RE.test(norm(t));
const scriptOf = t => /[\u0600-\u06FF]/.test(String(t || '')) ? 'arabic' : (/[A-Za-z]/.test(String(t || '')) ? 'latin' : 'none');
const langScript = l => ['ur', 'ar', 'ps', 'sd'].includes(l) ? 'arabic' : (l === 'pa' || l === 'other' ? 'any' : 'latin');
function parseRating(t) {
  const s = toAsciiDigits(String(t || '')).replace(/\uFE0F/g, '').trim();
  const stars = (s.match(/⭐|★/g) || []).length;
  if (stars >= 1 && stars <= 5 && s.replace(/⭐|★|\s/g, '') === '') return stars;
  const m = s.match(/^([1-5])(\s*\/\s*5)?\s*(stars?|⭐)?[.!]*$/i);
  return m ? +m[1] : null;
}
function pkToday() { try { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }); } catch (e) { return new Date().toISOString().slice(0, 10); } }

module.exports = {
  toAsciiDigits,
  norm,
  has,
  yes,
  splitList,
  titleCase,
  safeJson,
  esc,
  containsTerm,
  condOk,
  resolveCountry,
  visaRows,
  resolveVisa,
  supportedVisaNames,
  refusedVisaNames,
  activeCountries,
  pickQuestions,
  fieldDefFor,
  relevantFieldDefs,
  normPhone,
  prettyPhone,
  YES_RE,
  NO_RE,
  matchChoice,
  NOT_NAME,
  TD_MONTHS,
  TD_NAMES,
  TD_ALT,
  TD_AMBIG,
  tdMonth,
  tdDays,
  tdIso,
  tdYear,
  NB,
  friendlyDate,
  findDateExpr,
  resolveTravelDate,
  FLEX_DATE_RE,
  validateField,
  detectLang,
  EN_WORDS,
  RU_WORDS,
  latinLangVote,
  CLOSING_RE,
  isClosing,
  scriptOf,
  langScript,
  parseRating,
  pkToday,
};
