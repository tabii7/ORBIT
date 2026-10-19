# ORBIT Backend Product Plan (Proposal V2 Alignment)

**Status:** Reference plan for future implementation  
**Created:** 2026-09-11  
**Scope:** Backend API + AI Gateway + integrations only  
**Out of scope:** Mobile / Flutter / native app UI (clients consume APIs separately)

This plan maps the Executive Proposal (“AI Personal Business, Life & Health Manager”) to a backend delivery roadmap. It records what already exists on this VPS and what remains.

---

## 1. Product principles (non-negotiable)

1. **Chat-first** — natural language is the primary way to create/organize data.
2. **Minimum forms** — extract entities from conversation via tools.
3. **AI assists; user controls** — no auto bookings, payments, purchases, or trades.
4. **Smart information** — search, compare, summarize, recommend; user confirms sensitive steps.
5. **Simple notifications** — prefer Daily Summary; critical alerts only when needed.
6. **Multi-AI Gateway** — Claude / GPT / Kimi with routing + fallback; one assistant UX.

---

## 2. Current backend baseline (as of 2026-09-11)

| Area | Status |
|------|--------|
| Auth (email + Firebase social) | Done |
| Users / roles | Done |
| Profile + medical profile | Done |
| Conversations + message history | Done (HTTP; text + image/document attachments) |
| Health agent (GPT tools) | Done (single-provider; reads chat attachments) |
| Reminders CRUD + due + dose logs | Done |
| Symptoms diary | Done |
| Health document **metadata** + chat upload extract | Done for chat: PDF/TXT local + vision OCR for images/scanned PDFs (chat-only) |
| Device token registration | Done (no FCM send yet) |
| Personal productivity (general tasks) | v1 done (tasks, calendar, daily plan + productivity agent) |
| Business module | v1 done (notes/checklists, business tasks, research + business agent) |
| Travel & trips | Preferences API + chat hotel/flight web search (booking links) + TRAVEL reminders |
| Finance & ADX | v1 budget/watchlist/alerts storage; OpenAI market web_search removed (awaits vendor API key) |
| Document intelligence (any doc type) | Not started |
| Daily Summary / notification fan-out | v1 done (GET/generate + 07:00 TZ cron + soft FCM; critical still via reminder/finance) |
| Support Centre | Not started |
| Multi-AI Gateway (Claude/GPT/Kimi) | Not started (OpenAI only) |
| EHS / SEHA | Not started (explore + portal fallback) |

Live API docs: `http://<host>/docs` · Health notes: `backend/HEALTH.md`

---

## 3. Target architecture (backend)

```text
Clients (Flutter etc. — out of this plan)
        ↓  HTTPS / JWT
Backend API (NestJS)
  ├─ Auth / Users / Profile
  ├─ Conversations (chat history)
  ├─ Domain modules (Health, Productivity, Business, Travel, Finance, Docs, Support)
  ├─ Notifications (Daily Summary + critical)
  └─ Integrations (travel APIs, ADX vendor, portals)
        ↓
AI Gateway
  ├─ Router (task type → model)
  ├─ Providers: Claude | GPT | Kimi K3
  ├─ Fallback + normalize responses / tool calls
  └─ Usage / cost / error monitoring
        ↓
PostgreSQL (+ object storage for files)
```

**Chat model:** REST history (`GET …/messages`) + `POST …/messages` is enough for scrollable chat. Optional later: SSE streaming. Pusher/WebSockets not required for v1.

---

## 4. Shared platform work (do first)

### 4.1 AI Gateway / Multi-Model Router

**Goal:** One internal interface; clients never pick models.

| Capability | Detail |
|------------|--------|
| Providers | Anthropic Claude, OpenAI GPT, Moonshot Kimi K3 |
| Router | Route by task: general chat, docs/long context, complex reasoning, tool-heavy |
| Fallback | On timeout/5xx/rate-limit → next provider |
| Normalization | Unified `{ message, actions[], model, usage }` |
| Config | Env keys + routing table; no user-facing model picker |

**Deliverables**

- `src/ai/gateway/` — `AiGatewayService`, provider adapters, router policy
- Refactor Health agent to call Gateway (not raw `ChatOpenAI`)
- Metrics: provider, latency, tokens, fallback count

### 4.2 Conversation & agent framework

- Conversation `type` / intent routing: `HEALTH` | `PRODUCTIVITY` | `BUSINESS` | `TRAVEL` | `FINANCE` | `DOCUMENTS` | `SUPPORT` | `GENERAL`
- Shared tool-calling agent runner (LangGraph or equivalent) per domain
- Persist `actions[]` in message metadata (already for health)
- Optional: cross-conversation search tool over stored facts (not raw full transcript dump)

### 4.3 Files / object storage

- S3-compatible or local disk for PDFs/images
- `Document` entity (generic) with `category`, `fileUrl`, `extractedText`, `embedding?`
- Virus/size limits; signed upload URLs

### 4.4 Notifications backbone

- `Notification` + `DailySummary` models
- Job: build morning summary from due reminders, tasks, trips, finance alerts
- Critical path: FCM send using `device_tokens` (extend current devices module)
- Preference: consolidate non-critical into Daily Summary

---

## 5. Module plans (proposal §7–28)

### 5.1 AI Chat (primary interface) — §8

**Already:** medical chat + history.

**Next**

- Intent classifier → domain agent
- Clarifying questions in-chat when slots missing (“What time?”)
- Streaming responses (SSE) optional
- Unified action schema for UI cards (reminder created, trip options, etc.)

### 5.2 Personal Productivity — §10

**Done (v1):**

| Feature | API / behavior |
|---------|----------------|
| Tasks | `Task` model + `/api/productivity/tasks` + chat tools |
| Calendar events | `CalendarEvent` + `/api/productivity/calendar`; `remindMinutesBefore` → TASK reminder/FCM |
| Daily planning | `GET /api/productivity/daily-plan` + chat `organize_my_day` |
| Agent | Main → `PRODUCTIVITY` → ProductivityAgentService |

**Google Calendar (backend):** connect/sync/disconnect under `/api/productivity/calendar/google/*`; ORBIT events stay source of truth for chat; two-way push when linked. Needs `GOOGLE_CLIENT_SECRET` + Calendar API enabled.

**Later:** richer follow-up subtypes; Daily Summary digest (§5.8).

### 5.3 Business Management — §11

Conversational assistance (not full ERP).

**Done (v1):**

| Item | Detail |
|------|--------|
| Notes / checklists | `BusinessNote` (`NOTE`\|`CHECKLIST`\|`RESEARCH`\|`PLAN`) + `GET/POST/PATCH/DELETE /api/business/notes` |
| Business tasks | Reuse `Task` with `context=BUSINESS` + `/api/business/tasks` |
| Research | `POST /api/business/research` (OpenAI `web_search`; optional RESEARCH note) |
| Agent | Main → `BUSINESS` → BusinessAgentService |
| Docs | `backend/BUSINESS.md` |

**Later:** business documents (Document Intelligence); richer CRM-style reminders.

### 5.4 Travel & Trips — §12–15

**Principle:** search → compare → user selects → **external booking URL** (no payment in-app).

**Done (v1 + compare/trip):**

| Item | Detail |
|------|--------|
| Preferences | `GET/PUT /api/travel/preferences` (also on `GET /api/profile` as `travel`) |
| Unified chat | Same `POST /api/chat` — Main router → Health / Travel sub-agents |
| Hotel / flight search | OpenAI Responses `web_search` → real booking page links in Markdown |
| Compare / recommend | Score vs prefs (budget, stars, airlines, stops); persist ranked `TravelOffer` |
| Trip plans | `Trip` model + `GET/POST/PATCH/DELETE /api/travel/trips`; select hotel/flight offer |
| Chat tools | Travel agent: `plan_trip`, `create_trip`, `list_trips`, `get_trip`, `select_trip_offer` |
| Reminders | `ReminderType.TRAVEL` via `create_travel_reminder` tool |

**Agents:** Main (`src/ai/main`) classifies domains; Health and Travel each have their own prompt + tools. New domains = new sub-agent + router branch.

**Env:** `OPENAI_API_KEY` (same key as chat). Optional `OPENAI_SEARCH_MODEL`.

**No:** auto-book, store card data, charge users.

**Later:** commercial APIs (Amadeus/Duffel), richer compare UI cards on client.

### 5.5 Finance & ADX — §16–17

**Information only — no trade execution.**

**Done (v1):**

| Item | Detail |
|------|--------|
| Budget / expenses | `BudgetEntry` + `GET/POST/DELETE /api/finance/budget` + summary |
| Watchlists | `WatchlistItem` + `/api/finance/watchlist` |
| Price alerts | `FinanceAlert` stored only — auto poll/FCM via OpenAI **removed** |
| Unified chat | Main router → `FinanceAgentService` (`FINANCE` domain) — budget/watchlist tools |
| Quotes / news / research | **Removed** from OpenAI web_search |

**No:** auto-trade, brokerage credentials, payments, OpenAI for ADX/prices/news.

**Later:** dedicated market-data API key (user-provided) for quotes/alerts; not web search.

### 5.6 Basic Health — §18–20

**Largely done.** Remaining:

| Item | Work |
|------|------|
| Medicine / appointment reminders | Done |
| Document storage metadata | Done |
| PDF/image extract + “what does my report say?” | Chat upload vision/text extract done; full Document Intelligence (search/tags) later |
| EHS / SEHA | Phase: research APIs → integrate if approved; else portal links + upload fallback |
| Safety | Keep non-diagnostic stance (already in agent prompt) |

### 5.7 Document Intelligence — §21

| Capability | Detail |
|------------|--------|
| Upload | Any supported type (business, invoice, medical, travel, etc.) |
| Extract | OCR / PDF text |
| Chat Q&A | Tools: `search_documents`, `summarize_document`, `answer_from_document` |
| Organize | Tags, categories, link to domain entities |

Health-specific Q&A from §19 depends on this.

### 5.8 Notifications & Daily Summary — §22

**Done (v1):**

| Item | Detail |
|------|--------|
| Assemble | Reminders today, calendar, due/overdue tasks, upcoming trips, active finance alerts |
| API | `GET /api/daily-summary?date=`, `POST /api/daily-summary/generate?push=` |
| Cron | ~07:00 user TZ (`DAILY_SUMMARY_HOUR` / `MINUTE`) → generate + soft FCM |
| Chat | Productivity tool `get_daily_summary` |
| Critical FCM | Still reminder cron + finance alert cron (not batched into digest) |

### 5.9 Support Centre — §28

- Tickets: create via chat or REST
- Categories, attachments, reference number, status timeline
- FAQ content API
- Escalation flag
- Chat-first intake agent with tool `create_support_ticket`

### 5.10 Security & privacy — §29

Extend beyond current JWT:

- Encryption at rest for sensitive docs (KMS or app-level)
- Audit log for PHI/finance access
- Consent flags; retention jobs
- Rate limits on AI + auth
- Secrets only in env / vault

---

## 6. Phased delivery roadmap (backend only)

### Phase 0 — Foundation (1–2 weeks)
- AI Gateway (Claude + GPT + Kimi) + routing/fallback  
- Generic Document upload + text extraction skeleton  
- Notification + Daily Summary models (no fancy UI)  
- Intent routing on conversations  

### Phase 1 — Complete chat + productivity (2–3 weeks)
- Tasks + calendar events + chat tools  
- Daily Summary generation job  
- FCM send for critical reminders  
- Clarifying-question UX in agents  

### Phase 2 — Documents + Health depth (2–3 weeks)
- Full Document Intelligence Q&A  
- Health PDF ask/answer  
- EHS/SEHA research spike + portal fallback links  

### Phase 3 — Travel (3–5 weeks)
- Travel provider adapters (2+ sources if available)  
- Search/compare/select/confirm/handoff APIs  
- Travel chat agent + Smart Confirmation payload  

### Phase 4 — Finance / ADX (3–5 weeks, gated on data access)
- Budget/expenses  
- ADX vendor integration (post-licensing)  
- Watchlists + alerts  
- Finance chat agent (info-only)  

### Phase 5 — Business + Support (2–3 weeks)
- Business notes/tasks/docs via chat  
- Support Centre tickets + FAQ  

### Phase 6 — Hardening
- Audit logs, encryption, retention  
- Eval suites per agent domain  
- Cost/latency dashboards for Gateway  

---

## 7. Explicit non-goals (proposal-aligned)

- Mobile app implementation (this plan)  
- Automatic bookings / payments / purchases  
- Stock trade execution  
- Full clinical EMR / diagnosis / prescribing  
- Depending on a single AI vendor without fallback  

---

## 8. Success criteria (product)

| Criterion | Measure |
|-----------|---------|
| Chat-first | ≥80% of core create flows doable via chat tools without dedicated forms |
| User control | Travel/finance handoff never charges or books server-side |
| Multi-AI | Failover works when primary provider errors |
| Health | Reminders + docs Q&A + daily med items in summary |
| Notifications | Non-critical items batched into Daily Summary |
| History | Full scrollable thread via `GET /conversations/:id/messages` |

---

## 9. Suggested repo layout (future)

```text
backend/src/
  ai/gateway/          # multi-provider router
  ai/agents/           # health, productivity, travel, finance, docs, support
  productivity/
  business/
  travel/
  finance/
  documents/           # generic intelligence (supersede/extend health-documents)
  notifications/
  support/
docs/
  BACKEND_PRODUCT_PLAN.md   # this file
  HEALTH.md                 # exists under backend/
```

---

## 10. Immediate next recommended slice

When resuming implementation, start **Phase 0: AI Gateway** so all future domain agents share Claude/GPT/Kimi routing — then **Personal Productivity + Daily Summary + FCM**, which unlock the proposal’s “one assistant / consolidated notifications” promise without waiting on travel/ADX licensing.

---

## 11. Related docs

- Proposal source: user-provided Proposal V2 content (Executive Summary → Architecture)  
- Health implementation notes: [`backend/HEALTH.md`](../backend/HEALTH.md)  
- Prior health execution plan: `.cursor/plans/complete_health_backend_a6e9f8c3.plan.md` (health-only; superseded in breadth by this document)
