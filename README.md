# AEG Visa AI — Backend (v2)

n8n + Google Sheet workflow (**AEG Visa AI Agent V18.8**) ab **Node + Express + MongoDB** par.
Bot ka behaviour wahi hai (engine 1:1 port), lekin ab data MongoDB mein, control backend se, ACL ke saath.

---

## 1. Setup (pehli dafa)

```bash
npm install
cp .env.example .env          # apni purani .env ki values daalein + nayi keys (ENCRYPTION_KEY, AI_API_KEY ...)
npm run create-admin          # SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD .env se
npm run seed                  # default Settings + Manager / Agent / Viewer roles
npm run import:excel -- ./AEG.xlsx --dry-run   # Google Sheet: File > Download > .xlsx, pehle check
npm run import:excel -- ./AEG.xlsx             # asal import (upsert, dobara chalana safe)
npm run dev
npm test                      # 30 tests (engine, ACL, AI limits, HTTP) — DB/AI ke baghair chalte hain
```

Bot terminal se test: `API_KEY=aeg_xxx npm run chat` (ya `TOKEN=<jwt>`).

> **Zaroori:** `ENCRYPTION_KEY` ek dafa set karke kabhi mat badlein (Integrations ke secrets isi se encrypted hain).

---

## 2. Folder structure (wahi purana)

```
config/        db.config.js
constants/     httpStatus, messages, errorCodes, workflow (enums), defaultSettings
controllers/   har module ka controller (simple wale crudFactory se)
middlewares/   auth (JWT ya API key), acl, errorHandler, rateLimit, authorize
models/        User, Role, Customer, Lead, Query, Session, ChatLog, Setting, Country, VisaType,
               Question, Knowledge, Agent, ApiKey, Integration, AiUsage, Notification (+ Currency, Visa, Hotel)
routes/        index.js + har module ka route
scripts/       createSuperAdmin, seedDefaults, importFromExcel, chatCli
services/
  engine/      n8n code nodes ka port: buildContext, guard, buildReply, finalize, statusResult,
               dupCheck, leadCreated, queryLogged, helpers (shared), runtime ($() shim)
  integrations/ ai.provider, email.provider, whatsapp.provider, crm.provider, http
  workflow.service.js     n8n graph ki wiring (orchestrator)
  workflow.repository.js  Sheets nodes ki jagah Mongo
  workflow.hooks.js       lead ke baad: email, CRM push, notifications
  ai.service.js           AI control + limits
  ...baqi module services
utils/         crudFactory, routeFactory, queryBuilder, AppError, crypto, permissions, phone, excelMappers
tests/         node:test suite
```

### Reusable pattern
Naya module = model + 3 chhoti files:
```js
// services/x.service.js
module.exports = createCrudService(X, { searchFields: ["name"], filterFields: ["country"] });
// controllers/x.controller.js
module.exports = createCrudController(service, { entity: "X" });
// routes/x.route.js
module.exports = buildCrudRouter({ controller, module: ACL_MODULES.X, bulkKey: ["name"] });
```
Har list endpoint: `?page=1&limit=20&search=..&sort=-createdAt&isActive=true&<filter>=a,b&from=..&to=..`
Response: `{ error, message, data, meta: { pagination } }`

---

## 3. n8n → Backend mapping

| n8n node | Backend |
|---|---|
| Chat Trigger / Respond | `POST /api/chat/message` (n8n format `{ sessionId, chatInput }` bhi chalta hai, response mein `output`) |
| Extract Message, Session/Config cache | `workflow.service` + `config.service` (cache, admin edit par foran clear) |
| Read Settings/Countries/VisaTypes/Questions/Knowledge/Agents | MongoDB collections (frontend se CRUD) |
| Build Context, Guard, Build Reply, Finalize, Status Result, Dup Check, Lead Created, Query Logged | `services/engine/*` (same code) |
| AI Understand / AI Reply (Groq HTTP) | `ai.service.run()` → limits → `ai.provider` |
| Lookup/Append Leads, Append Query, Save Session, Append Log | `workflow.repository` |
| Email Agent (Gmail) | `email.provider` (SMTP) via `workflow.hooks` |

Engine mein 2 chhote additions (backend V1): AI limit par templates (phone/summary/status confirm) aur AI na ho to "confirm" code khud samajhta hai — taake limit par bhi lead ban sake.

---

## 4. Customer Profile (ek dafa)

- Pehchaan = phone (`+92XXXXXXXXXX` normalise). Ek phone = ek customer.
- Bot: naam + WhatsApp milte hi profile ban/mil jati hai; Lead, Query, Session mein sirf `customer` reference.
- Staff: `POST /api/customers` (duplicate phone par 409 + existing `customerId`).
- `GET /api/customers/:id/profile` → customer + saare leads, queries, sessions.

---

## 5. AI Control & Limits

Settings (frontend > AI Control, `PUT /api/ai/settings`):

| Key | Kaam |
|---|---|
| `AiEnabled`, `AiUnderstandEnabled`, `AiReplyEnabled` | Master / per-step switch |
| `AiDailyTokenLimit`, `AiMonthlyTokenLimit`, `AiDailyRequestLimit` | 0 = unlimited |
| `AiMaxCallsPerSession` | Ek customer session ki max AI calls |
| `AiWarnAtPercent` | Itne % par warning notification |
| `AiLimitNotifyEmails` | Limit/warning par email |
| `UnderstandModel`, `ReplyModel`, `ReplyTemperature`, `AiUnderstandMaxTokens`, `AiReplyMaxTokens`, `AiTimeoutMs` | Model control |
| `UnderstandPromptAppend`, `ReplyPromptAppend` | Admin ki extra hidayat prompt ke aakhir mein |

**Limit reach hone par:** AI call nahi hoti → bot normal (rule-based) mode mein chalta hai (direct answers, templates,
confirm, lead creation sab chalta hai) → `AI_LIMIT_REACHED` notification + email (din/mahine mein sirf ek dafa).
`GET /api/ai/status` → `mode: "ai" | "normal"`, usage %, limits.

AI provider (Groq/OpenAI/koi bhi OpenAI-compatible) aur key: `PUT /api/integrations/ai`.

---

## 6. Security: ACL + secure channels

1. **Members (frontend):** `Authorization: Bearer <JWT>` → role permissions.
2. **Machines (n8n, CRM, AI agent, WhatsApp bridge):** `x-api-key: aeg_...` → key ke apne scopes
   (wahi format: `[{ key: "LEADS", access: ["VIEW","CREATE"] }]`), optional IP allowlist + expiry.
   Key sirf banate waqt dikhti hai, DB mein hash. `POST /api/api-keys/:id/regenerate` se rotate.

Har route: `auth → roleAccessMiddleware(MODULE, ACTION)`. Koi apne se zyada permission wala role/key nahi bana sakta.
Modules list: `GET /api/roles/modules`. Integration secrets AES-256-GCM encrypted aur responses mein masked.

Misal: AI agent ko sirf leads padhne/likhne do →
```json
POST /api/api-keys
{ "name": "AI agent", "permissions": [{ "key": "LEADS", "access": ["VIEW","CREATE","UPDATE"] }, { "key": "CUSTOMERS", "access": ["VIEW"] }] }
```

---

## 7. Endpoints (sab `/api` ke neeche)

| Module (ACL key) | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/profile`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password` |
| Roles (MANAGE_ROLES) | `GET/POST /roles`, `GET/PUT /roles/:id`, `PATCH /roles/:id/status`, `GET /roles/modules` |
| Members (MEMBERS) | `GET/POST /members`, `GET/PUT /members/:id`, `PATCH /members/:id/status` |
| Settings (SETTINGS) | CRUD `/settings`, `GET /settings/map`, `PUT /settings {values}`, `POST /settings/bulk`, `POST /settings/seed-defaults` |
| Countries / Visa types / Questions / Knowledge / Agents | CRUD `/countries`, `/visa-types`, `/questions`, `/knowledge`, `/agents` + `POST /<x>/bulk {rows}` |
| Customers (CUSTOMERS) | CRUD `/customers`, `GET /customers/:id/profile`, `GET /customers/by-phone/:phone` |
| Leads (LEADS) | `GET/POST /leads`, `GET/PUT/DELETE /leads/:id`, `GET /leads/ref/:leadId`, `GET /leads/statuses`, `PATCH /leads/:id/status`, `PATCH /leads/:id/assign {agentId}`, `POST /leads/:id/notes`, `POST /leads/:id/crm-sync` |
| Queries (QUERIES) | CRUD `/queries`, `PATCH /queries/:id/answer {answer,status,addToKnowledge}` (jawab Knowledge mein → bot agli dafa khud jawab de) |
| Sessions (SESSIONS) | `GET /sessions`, `GET/DELETE /sessions/:id`, `POST /sessions/:id/reset`, `PATCH /sessions/:id/takeover {humanTakeover}` |
| Chat logs (CHAT_LOGS) | `GET /chat-logs`, `GET /chat-logs/:id` |
| Chat (CHAT) | `POST /chat/message { sessionId, text }` (`?debug=true`) |
| AI (AI_CONTROL) | `GET /ai/status`, `GET /ai/usage?period=day`, `GET/PUT /ai/settings`, `POST /ai/test` |
| Integrations (INTEGRATIONS) | `GET /integrations`, `GET/PUT /integrations/:type` (ai/crm/whatsapp/email), `POST /integrations/:type/test` |
| API keys (API_KEYS) | CRUD `/api-keys`, `PATCH /:id/status`, `POST /:id/regenerate`, `GET /api-keys/me` |
| Notifications (NOTIFICATIONS) | `GET /notifications?unread=true`, `PATCH /notifications/:id/read` (`all`) |
| Dashboard (DASHBOARD) | `GET /dashboard/stats` |
| Webhooks (public) | `GET/POST /webhooks/whatsapp` (phase 2) |
| Purane | `/currencies`, `/visas`, `/hotels` (ab sab par auth + ACL) |

---

## 8. Phase 2 (system test ke baad)

- **CRM:** `PUT /api/integrations/crm` → `baseUrl`, `endpoints`, `leadFieldMap`, `secrets.apiKey`, `isEnabled: true`.
  Naya lead khud push hota hai (`lead.crmSync`), fail par notification + `POST /leads/:id/crm-sync` retry.
  CRM ka format alag ho to sirf `services/integrations/crm.provider.js` badlega.
- **WhatsApp (Meta Cloud API):** `PUT /api/integrations/whatsapp` → `phoneNumberId`, `accessToken`, `verifyToken`,
  `appSecret`, enable. Meta webhook URL: `https://<domain>/api/webhooks/whatsapp`. Session id = `wa:<number>`.
  Agent takeover: `PATCH /sessions/:id/takeover`.

---

## 9. Purane code mein fix kiye gaye bugs

- `role.service` role ko `name: user.role` se dhoondta tha (user.role ObjectId hai) → non-admin users ke liye roles toot jate.
- `hotel.service` galti se `Visa` model use kar raha tha.
- `authorize.js` ESM `export default` (CommonJS mein crash).
- `auth.controller` `forgotPassword/resetPassword` call karta tha jo service mein the hi nahi.
- `/currencies` routes par koi auth nahi tha; `customers/:id/status` par auth missing; hotel/customer routes register hi nahi the.
- `customer.controller` `req.user._id` use karta tha (auth `id` set karta hai).
- `messages.js` export mismatch (`MESSAGES.ERROR` undefined).
- Super admin password script mein hard-coded tha → ab `.env`.

---

## 10. V19: Smart screening + refused demand leads + 1000 customers

Frontend ya APIs mein koi change nahi. Nayi cheezen sirf Settings keys hain (frontend ke Settings page par khud dikhti hain)
aur kuch naye values jo purani lists mein add hue hain.

### Bot ki samajh aur tone
- Travellers: "just me", "I'm travelling alone", "akela", "sirf main" = 1, "hum dono" = 2, "main, biwi aur 2 bache" = 4.
  Code khud samajhta hai (AI na bhi ho). Relationship bhi khud bhar jata hai.
- **AskNameFirst** (default yes): welcome hi naam poochta hai, phir har jawab naam aur pichli baton ke saath
  ("Shukriya Jamal. Aap kis mulk ka visa lena chahte hain?" -> "UAE, theek hai...").
- **RequireFullName** (default no): sirf pehla naam bhi chalega. Yes = ek dafa surname poocha jata hai.
- **WelcomeMessage**: khali = naya professional welcome. Apna text: `{assistant}`, `{business}` placeholders.
- Naam, country, purpose aur travellers ke seedhe jawab par AI #1 call nahi hoti: jawab tez, tokens kam.
- Bot sach hi bolta hai: koi poochhe "kya aap AI ho?" to haan kehta hai, insaan hone ka dawa nahi karta.

### Refused demand (jo hum process nahi karte)
- **CaptureRefusedLeads** (default yes): Countries mein Active = No, ya VisaTypes mein Action = Refuse par bot
  pehle mana karta hai, phir naam + WhatsApp leta hai aur Lead banata hai: status **RefusedLeadStatus** ("Not processed").
  Phir customer ko helpline (**SupportPhone**) ka bata deta hai. Customer mana kare to zabardasti nahi.
- Leads page par `?status=Not processed` se dekhein kaun si demand aa rahi hai. CRM / agent email nahi jati,
  sirf `REFUSED_DEMAND` notification. Same customer + same demand dobara = nayi lead nahi.
- **SupportPhone** zaroor set karein, warna jawab mein sirf "hamari helpline" likha aata hai.

### "Technical issue" wala masla (asal wajah)
- Engine `VISA_TYPE`, `UPDATE_AFTER_SUBMIT` queries aur `Lost` status bhejta tha jo Query model ki list mein nahi the:
  Mongo save fail -> "technical issue, 1 minute baad bhejein". Ab list mein hain.
- Customer ko kabhi "technical issue / 1 minute" nahi likha jata. DB likhne mein waqti masla ho to code khud dobara
  koshish karta hai. Poora turn fail ho to ek dafa dobara chalta hai, phir bhi na ho to narm jawab.

### Scale (1000 customers ek saath)
- AI queue: **AiMaxConcurrent** (40) requests ek waqt mein, baqi line mein (**AiQueueTimeoutMs** 8000).
  Line zyada lambi ho to foran rule-based jawab. **AiTotalBudgetMs** (22000) = ek AI step ka zyada se zyada waqt.
  Apne AI provider ki rate limit (RPM/TPM) ke hisaab se AiMaxConcurrent set karein.
- AI usage counters har 2 sec batch mein likhe jate hain (pehle har call par 2 DB writes ek hi document par).
- Session parhte waqt poora transcript load nahi hota. Customer link har message par dobara nahi likha jata.
- Chat rate limit: API key wali requests (website / n8n / WhatsApp bridge) ab har customer session ki,
  IP ki nahi. Pehle 120/min per IP par saare customers ruk jate the.
- Multi-core: `npm run start:cluster` (WEB_CONCURRENCY workers). Ek session ke messages Mongo lock se line mein.
  Kai alag servers par bhi chalana ho to `DISTRIBUTED_SESSION_LOCK=true`.
- Graceful shutdown, keep-alive, Mongo pool (`MONGO_POOL_SIZE`, default 100), WhatsApp duplicate message guard.

Nayi env (sab optional): `WEB_CONCURRENCY`, `DISTRIBUTED_SESSION_LOCK`, `MONGO_POOL_SIZE`, `MONGO_MIN_POOL_SIZE`,
`CHAT_SESSION_RATE_LIMIT` (30/min per session), `CHAT_RATE_LIMIT` (120/min per IP), `KEEP_ALIVE_TIMEOUT_MS`.

Deploy ke baad ek dafa: `npm run seed` (nayi Settings keys DB mein, purani values nahi chhedta).
Purani DB mein `LeadStatuses` setting ho to us mein `Not processed` khud add kar dein
(lead edit is ke baghair bhi chalta hai, `/leads/statuses` khud jor deta hai).
