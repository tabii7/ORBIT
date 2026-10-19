# ORBIT API response template

Every endpoint returns the **same JSON shape**.

## Fields (always present)

| Field | Type | Success | Error |
|-------|------|---------|-------|
| `success` | boolean | `true` | `false` |
| `code` | string | e.g. `REMINDER_LIST` | e.g. `NOT_FOUND` |
| `message` | string | human message | human message |
| `statusCode` | number | HTTP status | HTTP status |
| `data` | any \| null | payload | always `null` |
| `errors` | array \| null | always `null` | validation details or `null` |

## Success

```json
{
  "success": true,
  "code": "REMINDER_LIST",
  "message": "Reminders fetched successfully",
  "statusCode": 200,
  "data": {},
  "errors": null
}
```

## Error

```json
{
  "success": false,
  "code": "NOT_FOUND",
  "message": "Reminder not found",
  "statusCode": 404,
  "data": null,
  "errors": null
}
```

## Validation error

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "statusCode": 400,
  "data": null,
  "errors": ["email must be an email", "password must be a string"]
}
```

## Frontend usage

```dart
if (json['success'] == true) {
  final data = json['data'];
  final code = json['code']; // optional UI routing
} else {
  final message = json['message'];
  final errors = json['errors']; // List? or null
}
```
