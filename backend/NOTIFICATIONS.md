# ORBIT Notifications & Daily Summary

## Daily Summary

Cross-domain morning digest stored in `daily_summaries`.

### REST

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/daily-summary?date=` | Get/cached build for a day |
| `POST` | `/api/daily-summary/generate?date=&push=` | Force rebuild; optional soft FCM |

### Payload includes
- Reminders due that day (incl. medicine)
- Calendar events
- Tasks due / overdue
- Upcoming trips (today + 7 days)
- Active finance price alerts
- `headline` string for push / chat

### Cron
Every minute checks users whose **local** time is `DAILY_SUMMARY_HOUR:DAILY_SUMMARY_MINUTE` (default 07:00). Generates once per day and sends soft FCM (`type=DAILY_SUMMARY`).

### Chat
Main → PRODUCTIVITY → `get_daily_summary`

### Env
```bash
DAILY_SUMMARY_HOUR=7
DAILY_SUMMARY_MINUTE=0
```
