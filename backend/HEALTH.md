# ORBIT Health Backend

Complete health vertical: medical profile, reminders (CRUD + adherence), symptoms, health documents, device tokens, and a tool-using Health agent.

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
| `POST` | `/api/reminders` | Create MEDICINE / APPOINTMENT / TASK / GENERAL |
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

### Devices
- `POST /api/devices` — register FCM/APNs token
- `GET /api/devices`
- `DELETE /api/devices/:token`

### Conversations (Health agent)
- `POST /api/conversations` — default type `MEDICAL`
- `POST /api/conversations/:id/messages` — text and/or **images** + **documents**
- `GET /api/conversations/:id/messages` — history including `attachments[]`
- `DELETE /api/conversations/:id`
- `GENERAL` chats do not run health tools

#### Chat attachments (multipart)

```bash
curl -X POST "$HOST/api/conversations/$ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -F "content=Please read this report" \
  -F "images=@photo.jpg" \
  -F "documents=@report.pdf"
```

| Field | Purpose |
|-------|---------|
| `content` | Optional text (required if no files) |
| `images` | Up to 5 images (vision) ≤ 8MB each |
| `documents` | Up to 5 PDF/TXT (extracted + saved as health docs) ≤ 15MB |

- Documents: text extracted when possible, stored on `health_documents.extractedText`, linked from message attachments
- Images: sent to the vision-capable model with the message
- Agent tools: `search_health_documents`, `get_health_document`
- Files served under `/uploads/...`

## Health agent tools

| Tool | Effect |
|------|--------|
| `get_medical_profile` | Read profile |
| `save_medical_info` | Upsert profile fields |
| `list_reminders` / `list_due_reminders` | Read reminders |
| `create_medicine_reminder` / `create_appointment_reminder` | Create + profile meds |
| `update_reminder` / `cancel_reminder` | Edit / deactivate |
| `log_dose` | Adherence log |
| `log_symptom` / `list_symptoms` | Symptom diary |
| `save_health_document_note` | Document metadata |
| `get_health_summary` | Compact snapshot |

Prompt + few-shots live in `src/ai/health/health-agent.prompt.ts`.  
This is **prompt/tool training**, not model fine-tuning.

## Env

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini   # optional
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
