# ORBIT Business Backend

Business notes, checklists, business-context tasks, and informational research under the same chat: Main agent routes `BUSINESS` → Business sub-agent.

Personal tasks/calendar stay on **Productivity** (`TaskContext.PERSONAL`). Business to-dos use `TaskContext.BUSINESS` via `/api/business/tasks`.

## REST (`/api/business`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET/POST` | `/notes` | List / create notes (kinds: `NOTE`, `CHECKLIST`, `RESEARCH`, `PLAN`) |
| `PATCH/DELETE` | `/notes/:id` | Update / delete |
| `GET/POST` | `/tasks` | List / create business-context tasks |
| `PATCH` | `/tasks/:id` | Update |
| `POST` | `/tasks/:id/complete` | Mark done |
| `DELETE` | `/tasks/:id` | Delete |
| `POST` | `/research` | Closed — OpenAI only via `POST /api/chat` |

Research in chat is **informational only** — not legal, tax, or investment advice. OpenAI is **chat-only** (no background / direct REST).

## Chat tools

`create_business_note`, `list_business_notes`, `update_business_note`, `delete_business_note`, `create_business_task`, `list_business_tasks`, `complete_business_task`, `research_business`

## Routing hints

- “Business note: follow up with Acme…” → `BUSINESS`
- “Business task: send invoice by Friday” → `BUSINESS`
- “Create a launch checklist…” (work context) → `BUSINESS`
- “Research UAE SME digital marketing…” → `BUSINESS`
- Personal “add a task / organize my day” → `PRODUCTIVITY`

## Out of scope (this slice)

- Business documents / Document Intelligence
- Full CRM / ERP
- Trade execution or paid market-data vendors
