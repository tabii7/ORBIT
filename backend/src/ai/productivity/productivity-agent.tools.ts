import { TaskContext, TaskPriority, TaskStatus } from '@prisma/client';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { TasksService } from '../../productivity/tasks.service';
import { CalendarService } from '../../productivity/calendar.service';
import { DailyPlanService } from '../../productivity/daily-plan.service';
import { DailySummaryService } from '../../notifications/daily-summary.service';

export type ProductivityAgentAction = Record<string, unknown>;

export function createProductivityAgentTools(deps: {
  userId: string;
  timezone: string;
  tasksService: TasksService;
  calendarService: CalendarService;
  dailyPlanService: DailyPlanService;
  dailySummaryService: DailySummaryService;
  actions: ProductivityAgentAction[];
}) {
  const {
    userId,
    timezone,
    tasksService,
    calendarService,
    dailyPlanService,
    dailySummaryService,
    actions,
  } = deps;

  const priorityMap: Record<string, TaskPriority> = {
    LOW: TaskPriority.LOW,
    MEDIUM: TaskPriority.MEDIUM,
    HIGH: TaskPriority.HIGH,
  };

  const statusMap: Record<string, TaskStatus> = {
    TODO: TaskStatus.TODO,
    IN_PROGRESS: TaskStatus.IN_PROGRESS,
    DONE: TaskStatus.DONE,
    CANCELLED: TaskStatus.CANCELLED,
  };

  const createTask = tool(
    async (input) => {
      const task = await tasksService.create(
        userId,
        {
          title: input.title,
          description: input.description,
          priority: input.priority
            ? priorityMap[input.priority.toUpperCase()]
            : undefined,
          dueAt: input.due_at,
          tags: input.tags,
        },
        TaskContext.PERSONAL,
      );
      actions.push({ type: 'TASK_CREATED', data: task });
      return JSON.stringify({ ok: true, task });
    },
    {
      name: 'create_task',
      description: 'Create a personal task / to-do.',
      schema: z.object({
        title: z.string(),
        description: z.string().optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'low', 'medium', 'high']).optional(),
        due_at: z.string().optional().describe('ISO datetime'),
        tags: z.array(z.string()).optional(),
      }),
    },
  );

  const listTasks = tool(
    async (input) => {
      const tasks = await tasksService.list(userId, {
        includeDone: input.include_done === true,
        context: TaskContext.PERSONAL,
      });
      return JSON.stringify({ ok: true, tasks });
    },
    {
      name: 'list_tasks',
      description: 'List tasks (open by default).',
      schema: z.object({
        include_done: z.boolean().optional(),
      }),
    },
  );

  const completeTask = tool(
    async (input) => {
      const task = await tasksService.complete(userId, input.task_id);
      actions.push({ type: 'TASK_COMPLETED', data: task });
      return JSON.stringify({ ok: true, task });
    },
    {
      name: 'complete_task',
      description: 'Mark a task as DONE.',
      schema: z.object({ task_id: z.string() }),
    },
  );

  const updateTask = tool(
    async (input) => {
      const task = await tasksService.update(userId, input.task_id, {
        title: input.title,
        description: input.description,
        priority: input.priority
          ? priorityMap[input.priority.toUpperCase()]
          : undefined,
        status: input.status
          ? statusMap[input.status.toUpperCase()]
          : undefined,
        dueAt: input.due_at,
        tags: input.tags,
      });
      actions.push({ type: 'TASK_UPDATED', data: task });
      return JSON.stringify({ ok: true, task });
    },
    {
      name: 'update_task',
      description: 'Update task fields or status.',
      schema: z.object({
        task_id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'low', 'medium', 'high']).optional(),
        status: z
          .enum([
            'TODO',
            'IN_PROGRESS',
            'DONE',
            'CANCELLED',
            'todo',
            'in_progress',
            'done',
            'cancelled',
          ])
          .optional(),
        due_at: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
      }),
    },
  );

  const deleteTask = tool(
    async (input) => {
      const result = await tasksService.remove(userId, input.task_id);
      actions.push({ type: 'TASK_DELETED', data: result });
      return JSON.stringify(result);
    },
    {
      name: 'delete_task',
      description: 'Delete a task.',
      schema: z.object({ task_id: z.string() }),
    },
  );

  const createCalendarEvent = tool(
    async (input) => {
      const event = await calendarService.create(
        userId,
        {
          title: input.title,
          description: input.description,
          location: input.location,
          startAt: input.start_at,
          endAt: input.end_at,
          allDay: input.all_day,
          remindMinutesBefore: input.remind_minutes_before,
        },
        timezone,
      );
      actions.push({ type: 'CALENDAR_EVENT_CREATED', data: event });
      return JSON.stringify({
        ok: true,
        event,
        reminderLinked: Boolean(event.reminderId),
      });
    },
    {
      name: 'create_calendar_event',
      description:
        'Create a calendar event. Optional remind_minutes_before creates a TASK reminder for FCM.',
      schema: z.object({
        title: z.string(),
        start_at: z.string().describe('ISO datetime'),
        end_at: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        all_day: z.boolean().optional(),
        remind_minutes_before: z.number().int().positive().optional(),
      }),
    },
  );

  const listCalendarEvents = tool(
    async (input) => {
      const events = await calendarService.list(
        userId,
        input.from ? new Date(input.from) : undefined,
        input.to ? new Date(input.to) : undefined,
      );
      return JSON.stringify({ ok: true, events });
    },
    {
      name: 'list_calendar_events',
      description: 'List calendar events, optionally in a from/to window.',
      schema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    },
  );

  const deleteCalendarEvent = tool(
    async (input) => {
      const result = await calendarService.remove(userId, input.event_id);
      actions.push({ type: 'CALENDAR_EVENT_DELETED', data: result });
      return JSON.stringify(result);
    },
    {
      name: 'delete_calendar_event',
      description: 'Delete a calendar event.',
      schema: z.object({ event_id: z.string() }),
    },
  );

  const organizeMyDay = tool(
    async (input) => {
      const plan = await dailyPlanService.buildPlan(
        userId,
        timezone,
        input.date,
      );
      actions.push({
        type: 'DAILY_PLAN_BUILT',
        data: { date: plan.date, items: plan.plan.length },
      });
      return JSON.stringify({
        ok: true,
        plan,
        instruction:
          'Present a numbered day plan: events first with times, then prioritized tasks. Offer to complete_task or adjust.',
      });
    },
    {
      name: 'organize_my_day',
      description:
        'Build an ordered daily plan from today’s calendar events and open tasks.',
      schema: z.object({
        date: z.string().optional().describe('YYYY-MM-DD, defaults to today'),
      }),
    },
  );

  const getDailySummary = tool(
    async (input) => {
      const summary = await dailySummaryService.getOrCreate(userId, {
        date: input.date,
        force: input.refresh === true,
        sendPush: false,
      });
      actions.push({
        type: 'DAILY_SUMMARY_FETCHED',
        data: { date: summary.date, cached: summary.cached },
      });
      return JSON.stringify({
        ok: true,
        summary,
        instruction:
          'Present the headline, then short sections: reminders, calendar, tasks, trips, finance alerts. Soft digest only — do not invent items.',
      });
    },
    {
      name: 'get_daily_summary',
      description:
        'Get the cross-domain daily digest (reminders, calendar, tasks, trips, finance alerts).',
      schema: z.object({
        date: z.string().optional().describe('YYYY-MM-DD'),
        refresh: z
          .boolean()
          .optional()
          .describe('Force regenerate instead of cache'),
      }),
    },
  );

  return [
    createTask,
    listTasks,
    completeTask,
    updateTask,
    deleteTask,
    createCalendarEvent,
    listCalendarEvents,
    deleteCalendarEvent,
    organizeMyDay,
    getDailySummary,
  ];
}
