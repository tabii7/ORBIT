# ORBIT Health Backend

Complete health + travel + finance verticals on one chat: medical profile, reminders, symptoms, health documents, device tokens, travel preferences/trips, finance budget/watchlists/alerts, and Main → domain sub-agents.

## Base URL

- API: `/api`
- Swagger: `/docs`

All health endpoints require `Authorization: Bearer <JWT>`.

## REST overview

### Medical profile
- `GET/PUT /api/profile/medical` — conditions, allergies, medications, emergency contact, notes

### Reminders
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/reminders` | Create MEDICINE / APPOINTMENT / TASK / GENERAL / TRAVEL |
| `GET` | `/api/reminders` | List (`type`, `isActive`, `from`, `to`) |
| `GET` | `/api/reminders/due` | Due now (`remindAt <= now`) for client polling |
| `GET` | `/api/reminders/:id` | Detail + recent dose logs |
| `PATCH` | `/api/reminders/:id` | Edit schedule / status |
| `DELETE` | `/api/reminders/:id` | Soft-cancel (inactive + completed) |
| `POST` | `/api/reminders/:id/log` | `TAKEN` / `SKIPPED` / `SNOOZED` |

Scheduling uses **Luxon** and the user profile timezone (default `Asia/Dubai`).  
`DAILY` / `WEEKLY` advance after TAKEN/SKIPPED; `ONCE` completes.

A Nest cron marks `lastFiredAt` every minute for due rows (no FCM send yet).

### Symptoms
- `POST /api/symptoms` — diary entry (`symptoms[]`, `severity` 1–10)
- `GET /api/symptoms`
- `DELETE /api/symptoms/:id`

### Health documents
- `POST /api/health-documents` — metadata (`LAB` / `PRESCRIPTION` / `IMAGING` / `OTHER`)
- `GET /api/health-documents`
- `DELETE /api/health-documents/:id`
- **Chat upload:** attach `images` / `documents` on `POST /api/chat`. Text PDF/TXT parsed locally; images & scanned PDFs use vision OCR (**chat-only**). Agent reads extracted text and replies (medical → Health; invoice → Business; etc.).

### Travel preferences
- `GET/PUT /api/travel/preferences` — home city/airport, hotel/flight budgets, stars, airlines, cabin
- Also returned on `GET /api/profile` as `travel`

### Devices
- `POST /api/devices` — register FCM/APNs token
- `GET /api/devices`
- `DELETE /api/devices/:token`

### Chat (primary)

**One conversation endpoint; Main agent routes to sub-agents:**

`POST /api/chat`

| Field | Required | Notes |
|-------|----------|--------|
| `conversationId` | No | Omit = new chat; send = continue |
| `content` | If no files | User message text |
| `title` / `type` | No | Only used when creating new chat |
| `images` / `documents` | No | Optional multipart files |

Flow: `ConversationsService` → `MainAgentService` (classify) → `HealthAgentService` / `TravelAgentService` / `FinanceAgentService`.

Assistant message metadata includes `agent` and `routedTo` for debugging.

**New chat (JSON):**
```json
{ "content": "Find hotels in Istanbul Oct 10-14 under 800 AED and remind me the day before" }
```

**Continue chat:**
```json
{ "conversationId": "<id>", "content": "Also add an evening dose" }
```

**Response includes:** `conversationId`, `isNewConversation`, `userMessage`, `assistantMessage`, `actions[]`

### Conversations (history / list)

- `GET /api/conversations` — chat list
- `GET /api/conversations/:id/messages` — scrollable history
- `DELETE /api/conversations/:id`

## ORBIT agents

**Main (router)** — `src/ai/main/` — classifies `HEALTH` | `TRAVEL` (mixed → both sequentially). No domain tools.

**Health sub-agent** — `src/ai/health/`
| Tool | Effect |
|------|--------|
| `get_medical_profile` | Read profile |
| `save_medical_info` | Upsert profile fields |
| `list_reminders` / `list_due_reminders` | Read reminders |
| `create_medicine_reminder` / `create_appointment_reminder` / `create_general_reminder` | Create + profile meds |
| `update_reminder` / `cancel_reminder` | Edit / deactivate |
| `log_dose` | Adherence log |
| `log_symptom` / `list_symptoms` | Symptom diary |
| `save_health_document_note` | Document metadata |
| `get_health_summary` | Compact snapshot |

**Travel sub-agent** — `src/ai/travel/`
| Tool | Effect |
|------|--------|
| `get_travel_preferences` / `save_travel_preferences` | Profile travel defaults |
| `search_hotels` / `search_flights` | Web search → score/compare vs prefs → ranked offers + booking URLs |
| `plan_trip` | Create trip + search hotels/flights + attach ranked offers |
| `create_trip` / `list_trips` / `get_trip` | Trip CRUD shell |
| `select_trip_offer` | Mark hotel/flight choice; return external bookingUrl |
| `create_travel_reminder` | TRAVEL-type reminder for flight/hotel dates |

**Finance sub-agent** — `src/ai/finance/` (see also `FINANCE.md`)
| Tool | Effect |
|------|--------|
| `log_expense` / `log_income` / `list_budget` / `budget_summary` | Budget tracking |
| `add_watchlist` / `list_watchlist` / `remove_watchlist` | Symbols |
| `create_price_alert` / `list_price_alerts` | Threshold alerts → FCM |
| Market quotes / ADX / news | Removed from OpenAI web search — awaits dedicated market-data API |

**REST:** `GET/POST/PATCH/DELETE /api/travel/trips`, `POST …/select-hotel|select-flight`; finance under `/api/finance/*`.

Agents never book, pay, or execute trades — only recommend / inform with tool results.

Prompts live next to each agent (`*-agent.prompt.ts`). Adding a domain later: new folder under `src/ai/<domain>/`, register in `AiModule`, add a branch in Main classify/dispatch.

## Env

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini   # optional
OPENAI_SEARCH_MODEL=gpt-4o # optional; hotel/flight web_search model
DATABASE_URL=postgresql://...
JWT_SECRET=...
FIREBASE_PROJECT_ID=...
```

## Eval harness

```bash
OPENAI_API_KEY=sk-... npm run test:health-eval
```

Runs `scripts/health-agent-eval.ts` (Nest app context + live OpenAI).  
Prints `SKIP …` and exits 0 when `OPENAI_API_KEY` is missing.
## Client notification pattern

1. Register device: `POST /api/devices`
2. Poll `GET /api/reminders/due` on an interval / background task
3. Show local notification; call `POST /api/reminders/:id/log` when user acts

Push send from the server is intentionally out of scope for this phase.
