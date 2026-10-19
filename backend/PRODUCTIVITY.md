# ORBIT Productivity Backend

Personal productivity under the same chat: Main agent routes `PRODUCTIVITY` → Productivity sub-agent.

## REST (`/api/productivity`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET/POST` | `/tasks` | List / create tasks |
| `PATCH` | `/tasks/:id` | Update |
| `POST` | `/tasks/:id/complete` | Mark done |
| `DELETE` | `/tasks/:id` | Delete |
| `GET/POST` | `/calendar` | List / create events |
| `PATCH/DELETE` | `/calendar/:id` | Update / delete |
| `GET` | `/daily-plan?date=` | Ordered plan (events + open tasks) |
| `GET` | `/calendar/google/status` | Connection status |
| `POST` | `/calendar/google/connect` | Link Google (`serverAuthCode` or `refreshToken`) |
| `POST` | `/calendar/google/sync` | Import Google → ORBIT |
| `DELETE` | `/calendar/google` | Disconnect + revoke |

Calendar create accepts `remindMinutesBefore` → creates a `ReminderType.TASK` for FCM.  
If Google is connected, create/update/delete also push to Google Calendar.

## Google Calendar (backend)

### Env
```bash
GOOGLE_CLIENT_ID=<web client id>          # already used for social login
GOOGLE_CLIENT_SECRET=<web client secret>  # required to exchange serverAuthCode
```

Enable **Google Calendar API** on the same Google Cloud project.

### Flutter connect flow
1. `GoogleSignIn(scopes: ['https://www.googleapis.com/auth/calendar.events', 'email'], serverClientId: GOOGLE_CLIENT_ID)`
2. `signIn()` → `authentication.serverAuthCode`
3. `POST /api/productivity/calendar/google/connect` with `{ "serverAuthCode": "..." }` + JWT
4. `POST /api/productivity/calendar/google/sync`
5. Calendar UI uses `GET /api/productivity/calendar` (ORBIT copy)

### Sync model
- ORBIT `CalendarEvent` is what chat / daily-plan use
- Google-imported rows have `externalProvider=google` + `externalEventId`
- Two-way for ORBIT-created/updated/deleted events when connected

## Chat tools

`create_task`, `list_tasks`, `complete_task`, `update_task`, `delete_task`, `create_calendar_event`, `list_calendar_events`, `delete_calendar_event`, `organize_my_day`
