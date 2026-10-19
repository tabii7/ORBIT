import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role, TaskContext, TaskStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';
import { CalendarService } from './calendar.service';
import { DailyPlanService } from './daily-plan.service';
import { GoogleCalendarService } from './google-calendar.service';
import {
  ConnectGoogleCalendarDto,
  CreateCalendarEventDto,
  CreateTaskDto,
  UpdateCalendarEventDto,
  UpdateTaskDto,
} from './dto/productivity.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Productivity')
@ApiBearerAuth('JWT')
@Controller('productivity')
@UseGuards(JwtAuthGuard)
export class ProductivityController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly calendarService: CalendarService,
    private readonly dailyPlanService: DailyPlanService,
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly prisma: PrismaService,
  ) {}

  private async timezone(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    return profile?.timezone || 'Asia/Dubai';
  }

  @Get('tasks')
  @ApiSuccess({ code: ApiCode.TASK_LIST, message: 'Tasks fetched successfully' })
  @ApiOperation({
    summary: 'List tasks',
    description:
      'By default returns open tasks (not DONE/CANCELLED). Pass `includeDone=true` or a specific `status`.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: TaskStatus,
    description: 'Filter by exact status',
  })
  @ApiQuery({
    name: 'includeDone',
    required: false,
    example: 'true',
    description: 'Include DONE/CANCELLED when status is omitted',
  })
  listTasks(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: TaskStatus,
    @Query('includeDone') includeDone?: string,
  ) {
    return this.tasksService.list(user.id, {
      status,
      includeDone: includeDone === 'true' || includeDone === '1',
      context: TaskContext.PERSONAL,
    });
  }

  @Post('tasks')
  @ApiSuccess({
    code: ApiCode.TASK_CREATED,
    message: 'Task created successfully',
  })
  @ApiOperation({
    summary: 'Create a task',
    description: 'Also available via chat (`create_task` tool → PRODUCTIVITY agent).',
  })
  createTask(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.id, dto);
  }

  @Patch('tasks/:id')
  @ApiSuccess({
    code: ApiCode.TASK_UPDATED,
    message: 'Task updated successfully',
  })
  @ApiParam({ name: 'id', description: 'Task id' })
  @ApiOperation({ summary: 'Update a task' })
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(user.id, id, dto);
  }

  @Post('tasks/:id/complete')
  @ApiSuccess({
    code: ApiCode.TASK_UPDATED,
    message: 'Task completed successfully',
  })
  @ApiParam({ name: 'id', description: 'Task id' })
  @ApiOperation({ summary: 'Mark task done' })
  completeTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasksService.complete(user.id, id);
  }

  @Delete('tasks/:id')
  @ApiSuccess({
    code: ApiCode.TASK_DELETED,
    message: 'Task deleted successfully',
  })
  @ApiParam({ name: 'id', description: 'Task id' })
  @ApiOperation({ summary: 'Delete a task' })
  deleteTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasksService.remove(user.id, id);
  }

  @Get('calendar')
  @ApiSuccess({
    code: ApiCode.CALENDAR_EVENT_LIST,
    message: 'Calendar events fetched successfully',
  })
  @ApiOperation({
    summary: 'List ORBIT calendar events',
    description:
      'Includes locally created events and Google-imported events (`externalProvider=google`). Use after `POST .../calendar/google/sync`.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    example: '2026-10-01T00:00:00.000Z',
    description: 'ISO start (inclusive)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    example: '2026-10-31T23:59:59.000Z',
    description: 'ISO end (inclusive)',
  })
  listCalendar(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.calendarService.list(
      user.id,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Post('calendar')
  @ApiSuccess({
    code: ApiCode.CALENDAR_EVENT_CREATED,
    message: 'Calendar event created successfully',
  })
  @ApiOperation({
    summary: 'Create calendar event',
    description:
      '- Optional `remindMinutesBefore` creates a TASK reminder (FCM via reminder cron).\n' +
      '- If Google Calendar is connected, the event is also created in Google and linked via `externalEventId`.',
  })
  async createCalendar(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCalendarEventDto,
  ) {
    const tz = await this.timezone(user.id);
    return this.calendarService.create(user.id, dto, tz);
  }

  @Get('calendar/google/status')
  @ApiSuccess({
    code: ApiCode.GOOGLE_CALENDAR_STATUS,
    message: 'Google Calendar status fetched',
  })
  @ApiOperation({
    summary: 'Google Calendar connection status',
    description:
      'Returns `connected`, `googleEmail`, `lastSyncAt`, and `oauthConfigured` (true when `GOOGLE_CLIENT_SECRET` is set).',
  })
  googleStatus(@CurrentUser() user: AuthUser) {
    return this.googleCalendarService.status(user.id);
  }

  @Post('calendar/google/connect')
  @ApiSuccess({
    code: ApiCode.GOOGLE_CALENDAR_CONNECTED,
    message: 'Google Calendar connected',
  })
  @ApiBody({ type: ConnectGoogleCalendarDto })
  @ApiOperation({
    summary: 'Connect Google Calendar',
    description: `
### Flutter
1. Enable **Google Calendar API** in Google Cloud.
2. Set backend env \`GOOGLE_CLIENT_SECRET\` (web OAuth client secret for \`GOOGLE_CLIENT_ID\`).
3. Sign in with Calendar scope and **serverClientId** = web client id:

\`\`\`dart
final googleSignIn = GoogleSignIn(
  scopes: [
    'email',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  serverClientId: '<GOOGLE_CLIENT_ID web>',
);
final account = await googleSignIn.signIn();
final auth = await account!.authentication;
\`\`\`

4. Call this endpoint:

\`\`\`json
{ "serverAuthCode": "<auth.serverAuthCode>" }
\`\`\`

5. Then call **Sync** to import events.

### Alternative
Pass \`refreshToken\` (+ optional \`accessToken\` / \`expiresIn\`) if already exchanged.
`,
  })
  googleConnect(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConnectGoogleCalendarDto,
  ) {
    return this.googleCalendarService.connect(user.id, dto);
  }

  @Post('calendar/google/sync')
  @ApiSuccess({
    code: ApiCode.GOOGLE_CALENDAR_SYNCED,
    message: 'Google Calendar synced',
  })
  @ApiOperation({
    summary: 'Sync Google → ORBIT',
    description:
      'Imports events from the connected primary calendar (past 7 days → next 90 days) into `CalendarEvent` rows. Upserts by `externalEventId`.',
  })
  googleSync(@CurrentUser() user: AuthUser) {
    return this.googleCalendarService.syncFromGoogle(user.id);
  }

  @Delete('calendar/google')
  @ApiSuccess({
    code: ApiCode.GOOGLE_CALENDAR_DISCONNECTED,
    message: 'Google Calendar disconnected',
  })
  @ApiOperation({
    summary: 'Disconnect Google Calendar',
    description:
      'Revokes the OAuth token when possible and deletes the stored connection. Existing ORBIT calendar rows are kept.',
  })
  googleDisconnect(@CurrentUser() user: AuthUser) {
    return this.googleCalendarService.disconnect(user.id);
  }

  @Patch('calendar/:id')
  @ApiSuccess({
    code: ApiCode.CALENDAR_EVENT_UPDATED,
    message: 'Calendar event updated successfully',
  })
  @ApiParam({ name: 'id', description: 'ORBIT calendar event id' })
  @ApiOperation({
    summary: 'Update calendar event',
    description:
      'If the event is linked to Google (`externalProvider=google`), the remote Google event is patched too.',
  })
  updateCalendar(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.update(user.id, id, dto);
  }

  @Delete('calendar/:id')
  @ApiSuccess({
    code: ApiCode.CALENDAR_EVENT_DELETED,
    message: 'Calendar event deleted successfully',
  })
  @ApiParam({ name: 'id', description: 'ORBIT calendar event id' })
  @ApiOperation({
    summary: 'Delete calendar event',
    description:
      'If linked to Google, deletes the Google event as well, then removes the ORBIT row.',
  })
  deleteCalendar(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calendarService.remove(user.id, id);
  }

  @Get('daily-plan')
  @ApiSuccess({ code: ApiCode.DAILY_PLAN, message: 'Daily plan ready' })
  @ApiOperation({
    summary: 'Build daily plan',
    description:
      'Ordered plan for a day: calendar events first (by time), then open tasks by priority/due. Also available in chat via `organize_my_day`.',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    example: '2026-10-07',
    description: 'YYYY-MM-DD in user timezone (defaults to today)',
  })
  async dailyPlan(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ) {
    const tz = await this.timezone(user.id);
    return this.dailyPlanService.buildPlan(user.id, tz, date);
  }
}
