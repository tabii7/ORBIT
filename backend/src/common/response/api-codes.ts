/** Standard API success / error codes used across ORBIT. */
export const ApiCode = {
  // Generic success
  SUCCESS: 'SUCCESS',
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  DELETED: 'DELETED',
  FETCHED: 'FETCHED',

  // Auth
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  REGISTER_SUCCESS: 'REGISTER_SUCCESS',
  SOCIAL_LOGIN_SUCCESS: 'SOCIAL_LOGIN_SUCCESS',
  OTP_SENT: 'OTP_SENT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Domain
  REMINDER_CREATED: 'REMINDER_CREATED',
  REMINDER_UPDATED: 'REMINDER_UPDATED',
  REMINDER_DELETED: 'REMINDER_DELETED',
  REMINDER_LIST: 'REMINDER_LIST',
  REMINDER_DETAIL: 'REMINDER_DETAIL',
  SCHEDULE_LIST: 'SCHEDULE_LIST',
  CHAT_SUCCESS: 'CHAT_SUCCESS',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  TRAVEL_PREFS_UPDATED: 'TRAVEL_PREFS_UPDATED',
  TRIP_CREATED: 'TRIP_CREATED',
  TRIP_UPDATED: 'TRIP_UPDATED',
  TRIP_DELETED: 'TRIP_DELETED',
  TRIP_LIST: 'TRIP_LIST',
  TRIP_DETAIL: 'TRIP_DETAIL',
  TRIP_OFFER_SELECTED: 'TRIP_OFFER_SELECTED',
  BUDGET_CREATED: 'BUDGET_CREATED',
  BUDGET_LIST: 'BUDGET_LIST',
  BUDGET_SUMMARY: 'BUDGET_SUMMARY',
  BUDGET_DELETED: 'BUDGET_DELETED',
  WATCHLIST_CREATED: 'WATCHLIST_CREATED',
  WATCHLIST_LIST: 'WATCHLIST_LIST',
  WATCHLIST_DELETED: 'WATCHLIST_DELETED',
  FINANCE_ALERT_CREATED: 'FINANCE_ALERT_CREATED',
  FINANCE_ALERT_LIST: 'FINANCE_ALERT_LIST',
  FINANCE_ALERT_UPDATED: 'FINANCE_ALERT_UPDATED',
  FINANCE_ALERT_DELETED: 'FINANCE_ALERT_DELETED',
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_LIST: 'TASK_LIST',
  TASK_DELETED: 'TASK_DELETED',
  CALENDAR_EVENT_CREATED: 'CALENDAR_EVENT_CREATED',
  CALENDAR_EVENT_UPDATED: 'CALENDAR_EVENT_UPDATED',
  CALENDAR_EVENT_LIST: 'CALENDAR_EVENT_LIST',
  CALENDAR_EVENT_DELETED: 'CALENDAR_EVENT_DELETED',
  DAILY_PLAN: 'DAILY_PLAN',
  GOOGLE_CALENDAR_CONNECTED: 'GOOGLE_CALENDAR_CONNECTED',
  GOOGLE_CALENDAR_STATUS: 'GOOGLE_CALENDAR_STATUS',
  GOOGLE_CALENDAR_SYNCED: 'GOOGLE_CALENDAR_SYNCED',
  GOOGLE_CALENDAR_DISCONNECTED: 'GOOGLE_CALENDAR_DISCONNECTED',
  DAILY_SUMMARY: 'DAILY_SUMMARY',
  DAILY_SUMMARY_GENERATED: 'DAILY_SUMMARY_GENERATED',
  BUSINESS_NOTE_CREATED: 'BUSINESS_NOTE_CREATED',
  BUSINESS_NOTE_UPDATED: 'BUSINESS_NOTE_UPDATED',
  BUSINESS_NOTE_LIST: 'BUSINESS_NOTE_LIST',
  BUSINESS_NOTE_DELETED: 'BUSINESS_NOTE_DELETED',
  BUSINESS_TASK_CREATED: 'BUSINESS_TASK_CREATED',
  BUSINESS_TASK_LIST: 'BUSINESS_TASK_LIST',
  BUSINESS_RESEARCH: 'BUSINESS_RESEARCH',
  CHAT_FOLDER_CREATED: 'CHAT_FOLDER_CREATED',
  CHAT_FOLDER_UPDATED: 'CHAT_FOLDER_UPDATED',
  CHAT_FOLDER_LIST: 'CHAT_FOLDER_LIST',
  CHAT_FOLDER_DELETED: 'CHAT_FOLDER_DELETED',
  CONVERSATION_UPDATED: 'CONVERSATION_UPDATED',
  CONVERSATION_LIST: 'CONVERSATION_LIST',
  SUPPORT_CONTACT_SENT: 'SUPPORT_CONTACT_SENT',

  // Errors
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiCodeType = (typeof ApiCode)[keyof typeof ApiCode];

export const DEFAULT_SUCCESS_MESSAGE: Record<string, string> = {
  [ApiCode.SUCCESS]: 'Request completed successfully',
  [ApiCode.CREATED]: 'Created successfully',
  [ApiCode.UPDATED]: 'Updated successfully',
  [ApiCode.DELETED]: 'Deleted successfully',
  [ApiCode.FETCHED]: 'Fetched successfully',
  [ApiCode.LOGIN_SUCCESS]: 'Login successful',
  [ApiCode.REGISTER_SUCCESS]: 'Registration successful',
  [ApiCode.SOCIAL_LOGIN_SUCCESS]: 'Social login successful',
  [ApiCode.OTP_SENT]: 'Verification code sent to your email',
  [ApiCode.REMINDER_CREATED]: 'Reminder created successfully',
  [ApiCode.REMINDER_UPDATED]: 'Reminder updated successfully',
  [ApiCode.REMINDER_DELETED]: 'Reminder deleted successfully',
  [ApiCode.REMINDER_LIST]: 'Reminders fetched successfully',
  [ApiCode.REMINDER_DETAIL]: 'Reminder fetched successfully',
  [ApiCode.SCHEDULE_LIST]: 'Schedules fetched successfully',
  [ApiCode.CHAT_SUCCESS]: 'Chat response ready',
  [ApiCode.PROFILE_UPDATED]: 'Profile updated successfully',
  [ApiCode.TRAVEL_PREFS_UPDATED]: 'Travel preferences saved successfully',
  [ApiCode.TRIP_CREATED]: 'Trip created successfully',
  [ApiCode.TRIP_UPDATED]: 'Trip updated successfully',
  [ApiCode.TRIP_DELETED]: 'Trip deleted successfully',
  [ApiCode.TRIP_LIST]: 'Trips fetched successfully',
  [ApiCode.TRIP_DETAIL]: 'Trip fetched successfully',
  [ApiCode.TRIP_OFFER_SELECTED]: 'Travel offer selected',
  [ApiCode.BUDGET_CREATED]: 'Budget entry created successfully',
  [ApiCode.BUDGET_LIST]: 'Budget entries fetched successfully',
  [ApiCode.BUDGET_SUMMARY]: 'Budget summary fetched successfully',
  [ApiCode.BUDGET_DELETED]: 'Budget entry deleted successfully',
  [ApiCode.WATCHLIST_CREATED]: 'Watchlist item added successfully',
  [ApiCode.WATCHLIST_LIST]: 'Watchlist fetched successfully',
  [ApiCode.WATCHLIST_DELETED]: 'Watchlist item removed successfully',
  [ApiCode.FINANCE_ALERT_CREATED]: 'Finance alert created successfully',
  [ApiCode.FINANCE_ALERT_LIST]: 'Finance alerts fetched successfully',
  [ApiCode.FINANCE_ALERT_UPDATED]: 'Finance alert updated successfully',
  [ApiCode.FINANCE_ALERT_DELETED]: 'Finance alert deleted successfully',
  [ApiCode.TASK_CREATED]: 'Task created successfully',
  [ApiCode.TASK_UPDATED]: 'Task updated successfully',
  [ApiCode.TASK_LIST]: 'Tasks fetched successfully',
  [ApiCode.TASK_DELETED]: 'Task deleted successfully',
  [ApiCode.CALENDAR_EVENT_CREATED]: 'Calendar event created successfully',
  [ApiCode.CALENDAR_EVENT_UPDATED]: 'Calendar event updated successfully',
  [ApiCode.CALENDAR_EVENT_LIST]: 'Calendar events fetched successfully',
  [ApiCode.CALENDAR_EVENT_DELETED]: 'Calendar event deleted successfully',
  [ApiCode.DAILY_PLAN]: 'Daily plan ready',
  [ApiCode.GOOGLE_CALENDAR_CONNECTED]: 'Google Calendar connected',
  [ApiCode.GOOGLE_CALENDAR_STATUS]: 'Google Calendar status fetched',
  [ApiCode.GOOGLE_CALENDAR_SYNCED]: 'Google Calendar synced',
  [ApiCode.GOOGLE_CALENDAR_DISCONNECTED]: 'Google Calendar disconnected',
  [ApiCode.DAILY_SUMMARY]: 'Daily summary fetched successfully',
  [ApiCode.DAILY_SUMMARY_GENERATED]: 'Daily summary generated successfully',
  [ApiCode.BUSINESS_NOTE_CREATED]: 'Business note created successfully',
  [ApiCode.BUSINESS_NOTE_UPDATED]: 'Business note updated successfully',
  [ApiCode.BUSINESS_NOTE_LIST]: 'Business notes fetched successfully',
  [ApiCode.BUSINESS_NOTE_DELETED]: 'Business note deleted successfully',
  [ApiCode.BUSINESS_TASK_CREATED]: 'Business task created successfully',
  [ApiCode.BUSINESS_TASK_LIST]: 'Business tasks fetched successfully',
  [ApiCode.BUSINESS_RESEARCH]: 'Business research ready',
  [ApiCode.CHAT_FOLDER_CREATED]: 'Chat folder created successfully',
  [ApiCode.CHAT_FOLDER_UPDATED]: 'Chat folder updated successfully',
  [ApiCode.CHAT_FOLDER_LIST]: 'Chat folders fetched successfully',
  [ApiCode.CHAT_FOLDER_DELETED]: 'Chat folder deleted successfully',
  [ApiCode.CONVERSATION_UPDATED]: 'Conversation updated successfully',
  [ApiCode.CONVERSATION_LIST]: 'Conversations fetched successfully',
  [ApiCode.SUPPORT_CONTACT_SENT]: 'Support message sent successfully',
};

export function errorCodeFromStatus(status: number): ApiCodeType {
  switch (status) {
    case 400:
      return ApiCode.BAD_REQUEST;
    case 401:
      return ApiCode.UNAUTHORIZED;
    case 403:
      return ApiCode.FORBIDDEN;
    case 404:
      return ApiCode.NOT_FOUND;
    case 409:
      return ApiCode.CONFLICT;
    case 422:
      return ApiCode.VALIDATION_ERROR;
    case 429:
      return ApiCode.TOO_MANY_REQUESTS;
    default:
      return status >= 500 ? ApiCode.INTERNAL_ERROR : ApiCode.BAD_REQUEST;
  }
}
