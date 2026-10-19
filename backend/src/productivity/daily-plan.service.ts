import { Injectable } from '@nestjs/common';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { TasksService } from './tasks.service';
import { CalendarService } from './calendar.service';

const PRIORITY_RANK: Record<TaskPriority, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

@Injectable()
export class DailyPlanService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly calendarService: CalendarService,
  ) {}

  async buildPlan(userId: string, timezone = 'Asia/Dubai', dateIso?: string) {
    const day = dateIso
      ? DateTime.fromISO(dateIso, { zone: timezone })
      : DateTime.now().setZone(timezone);
    const dayStart = day.startOf('day');
    const dayEnd = day.endOf('day');

    const [tasks, events] = await Promise.all([
      this.tasksService.list(userId, { includeDone: false }),
      this.calendarService.listForDay(userId, day),
    ]);

    const openTasks = tasks.filter(
      (t) =>
        t.status === TaskStatus.TODO || t.status === TaskStatus.IN_PROGRESS,
    );

    const dueToday = openTasks.filter(
      (t) =>
        t.dueAt &&
        DateTime.fromJSDate(t.dueAt).setZone(timezone) >= dayStart &&
        DateTime.fromJSDate(t.dueAt).setZone(timezone) <= dayEnd,
    );
    const overdue = openTasks.filter(
      (t) =>
        t.dueAt && DateTime.fromJSDate(t.dueAt).setZone(timezone) < dayStart,
    );
    const undated = openTasks.filter((t) => !t.dueAt);

    const rankedTasks = [...overdue, ...dueToday, ...undated].sort((a, b) => {
      const pr = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      if (pr !== 0) return pr;
      const aDue = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDue = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });

    const schedule = [
      ...events.map((e) => ({
        kind: 'EVENT' as const,
        id: e.id,
        title: e.title,
        at: e.startAt,
        endAt: e.endAt,
        location: e.location,
        priority: null as TaskPriority | null,
      })),
      ...rankedTasks.map((t) => ({
        kind: 'TASK' as const,
        id: t.id,
        title: t.title,
        at: t.dueAt,
        endAt: null as Date | null,
        location: null as string | null,
        priority: t.priority,
      })),
    ].sort((a, b) => {
      if (a.kind === 'EVENT' && b.kind !== 'EVENT') return -1;
      if (b.kind === 'EVENT' && a.kind !== 'EVENT') return 1;
      const aT = a.at?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bT = b.at?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aT - bT;
    });

    return {
      date: day.toISODate(),
      timezone,
      summary: {
        events: events.length,
        openTasks: openTasks.length,
        overdue: overdue.length,
        dueToday: dueToday.length,
      },
      events,
      tasks: rankedTasks,
      plan: schedule.map((item, index) => ({
        order: index + 1,
        ...item,
      })),
      suggestion:
        events.length || rankedTasks.length
          ? 'Work calendar blocks first, then high-priority / overdue tasks, then undated work.'
          : 'No tasks or events for this day — add a task or calendar event to build a plan.',
    };
  }
}
