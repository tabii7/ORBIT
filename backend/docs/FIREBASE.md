# Firebase config (backend)

## Files

| File | Purpose |
|------|---------|
| `config/firebase-connection.json` | Project IDs, OAuth clients, app ids (safe to keep in repo) |
| `config/firebase-service-account.example.json` | Template for Admin SDK |
| `config/firebase-service-account.json` | **Real private key** — create locally, never commit |

## Env

```bash
FIREBASE_PROJECT_ID=orbitai-dccf8
FIREBASE_CONNECTION_PATH=./config/firebase-connection.json
FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-service-account.json
```

## How to add the Admin service account

1. Firebase Console → Project settings → Service accounts  
2. Generate new private key  
3. Save as `backend/config/firebase-service-account.json`  
4. Restart API: `pm2 restart orbit-api --update-env`

## Reminder push notifications (FCM)

### Flow
1. App sends `fcmToken` + `platform` on login/register/social or `POST /api/devices`
2. Every minute, cron finds due reminders (`remindAt <= now`, active, not completed)
3. If not already fired for that `remindAt`, server sends FCM and sets `lastFiredAt`

### Required file
Copy Firebase Admin private key to:

`backend/config/firebase-service-account.json`

Env:
```bash
FIREBASE_PROJECT_ID=orbitai-dccf8
FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-service-account.json
```

Without the service account file, cron still runs but push is skipped (logged as FCM_NOT_CONFIGURED).

### Flutter notification data
```json
{
  "type": "REMINDER",
  "reminderId": "...",
  "reminderType": "MEDICINE"
}
```
Android channel: `orbit_reminders`
