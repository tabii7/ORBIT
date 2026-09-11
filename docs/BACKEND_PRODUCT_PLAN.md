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
| Health document **metadata** + chat upload extract | Partial (PDF/TXT extract via chat; OCR for scans not yet) |
| Device token registration | Done (no FCM send yet) |
| Personal productivity (general tasks) | Partial (reminders only; no tasks/calendar/daily plan) |
| Business module | Not started |
| Travel & trips | Not started |
| Finance & ADX | Not started |
| Document intelligence (any doc type) | Not started |
| Daily Summary / notification fan-out | Not started |
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

| Feature | API / behavior |
|---------|----------------|
| Tasks | CRUD + chat tools (`create_task`, `complete_task`, `list_tasks`) |
| Reminders | Extend beyond health (already general types exist) |
| Calendar events | CRUD + “remind me 2h before” |
| Daily planning | Chat: “organize my day” → propose ordered plan from tasks/events |
| Follow-ups | Task subtype or linked reminders |

**DB:** `Task`, `CalendarEvent` (or unify under `Reminder` + `Task`).

### 5.3 Business Management — §11

Conversational assistance (not full ERP):

- Business tasks / reminders / notes
- Business documents (link to Document Intelligence)
- Research summaries (via Gateway; cite sources where possible)
- Business planning checklists stored as structured notes

**DB:** `BusinessNote`, reuse Task/Reminder with `context=BUSINESS`, or `tag`.

### 5.4 Travel & Trips — §12–15

**Principle:** search → compare → user selects → smart confirmation → **external booking URL** (no payment in-app).

| Step | Backend |
|------|---------|
| Parse request | origin, dest, dates, budget, pax |
| Multi-source search | Adapter interface: Provider A/B (Amadeus, Duffel, etc. — finalize commercially) |
| Compare | Normalize offers; sort by price/duration |
| Present | `TravelSearch` + `TravelOffer` records |
| Confirm | `TravelSelection` summary payload for UI |
| Handoff | Return deep link / booking URL only |

**No:** auto-book, store card data, charge users.

### 5.5 Finance & ADX — §16–17

**Information only — no trade execution.**

| Feature | Notes |
|---------|--------|
| Budget / expenses | User-entered + chat extraction |
| Summaries | Spend by category |
| ADX market data | Via approved vendor/API after licensing check |
| Watchlists + smart alerts | Thresholds → notification / Daily Summary |
| News | Aggregated informational feed |

**Pre-dev gate:** verify ADX API/licensing (real-time vs delayed).

**Hard block:** buy/sell/transfer/execute trades.

### 5.6 Basic Health — §18–20

**Largely done.** Remaining:

| Item | Work |
|------|------|
| Medicine / appointment reminders | Done |
| Document storage metadata | Done |
| PDF text extract + “what does my report say?” | Document Intelligence pipeline |
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

- Cron (e.g. 07:00 user TZ): assemble appointments, tasks, health meds, travel, finance alerts
- `GET /api/daily-summary?date=`
- FCM for critical; soft items only in summary
- Chat: “What’s my daily summary?”

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
