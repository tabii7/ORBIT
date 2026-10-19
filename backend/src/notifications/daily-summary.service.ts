import { Injectable } from '@nestjs/common';
import {
  ReminderType,
  TaskStatus,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

export type DailySummaryPayload = {
  date: string;
  timezone: string;
  generatedAt: string;
  counts: {
    reminders: number;
    medicineReminders: number;
    calendarEvents: number;
    tasksDue: number;
    tasksOverdue: number;
    trips: number;
    financeAlerts: number;
  };
  reminders: Array<{
    id: string;
    type: string;
    title: string;
    remindAt: string;
    medicineName?: string | null;
  }>;
  calendarEvents: Array<{
    id: string;
    title: string;
    startAt: string;
    endAt?: string | null;
    location?: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    dueAt?: string | null;
    overdue: boolean;
  }>;
  trips: Array<{
    id: string;
    title: string;
    destination: string;
    startDate?: string | null;
    status: string;
  }>;
  financeAlerts: Array<{
    id: string;
    symbol: string;
    condition: string;
    threshold: number;
  }>;
  headline: string;
};

@Injectable()
export class DailySummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getTimezone(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    return profile?.timezone || 'Asia/Dubai';
  }

  async buildPayload(
    userId: string,
    timezone: string,
    dateIso?: string,
  ): Promise<DailySummaryPayload> {
    const day = dateIso
      ? DateTime.fromISO(dateIso, { zone: timezone })
      : DateTime.now().setZone(timezone);
    const date = day.toISODate()!;
    const dayStart = day.startOf('day');
    const dayEnd = day.endOf('day');
    const startUtc = dayStart.toUTC().toJSDate();
    const endUtc = dayEnd.toUTC().toJSDate();

    const [reminders, events, tasks, trips, financeAlerts] = await Promise.all([
      this.prisma.reminder.findMany({
        where: {
          userId,
          isActive: true,
          isCompleted: false,
          remindAt: { gte: startUtc, lte: endUtc },
        },
        orderBy: { remindAt: 'asc' },
      }),
      this.prisma.calendarEvent.findMany({
        where: {
          userId,
          startAt: { gte: startUtc, lte: endUtc },
        },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.task.findMany({
        where: {
          userId,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
        },
        orderBy: [{ dueAt: 'asc' }, { priority: 'desc' }],
      }),
      this.prisma.trip.findMany({
        where: {
          userId,
          OR: [
            {
              startDate: { gte: startUtc, lte: endUtc },
            },
            {
              startDate: {
                gte: startUtc,
                lte: day.plus({ days: 7 }).endOf('day').toUTC().toJSDate(),
              },
            },
          ],
        },
        orderBy: { startDate: 'asc' },
        take: 10,
      }),
      this.prisma.financeAlert.findMany({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const tasksDue = tasks.filter((t) => {
      if (!t.dueAt) return false;
      const d = DateTime.fromJSDate(t.dueAt).setZone(timezone);
      return d >= dayStart && d <= dayEnd;
    });
    const tasksOverdue = tasks.filter((t) => {
      if (!t.dueAt) return false;
      return DateTime.fromJSDate(t.dueAt).setZone(timezone) < dayStart;
    });

    const medicineReminders = reminders.filter(
      (r) => r.type === ReminderType.MEDICINE,
    );

    const parts: string[] = [];
    if (medicineReminders.length) {
      parts.push(`${medicineReminders.length} medicine reminder(s)`);
    }
    if (events.length) parts.push(`${events.length} calendar event(s)`);
    if (tasksDue.length + tasksOverdue.length) {
      parts.push(
        `${tasksDue.length + tasksOverdue.length} task(s) due/overdue`,
      );
    }
    if (trips.length) parts.push(`${trips.length} upcoming trip(s)`);
    if (financeAlerts.length) {
      parts.push(`${financeAlerts.length} active price alert(s)`);
    }

    const headline = parts.length
      ? `Today: ${parts.join(', ')}.`
      : 'Your day looks clear — no reminders, events, or due tasks.';

    return {
      date,
      timezone,
      generatedAt: DateTime.now().setZone(timezone).toISO()!,
      counts: {
        reminders: reminders.length,
        medicineReminders: medicineReminders.length,
        calendarEvents: events.length,
        tasksDue: tasksDue.length,
        tasksOverdue: tasksOverdue.length,
        trips: trips.length,
        financeAlerts: financeAlerts.length,
      },
      reminders: reminders.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        remindAt: r.remindAt.toISOString(),
        medicineName: r.medicineName,
      })),
      calendarEvents: events.map((e) => ({
        id: e.id,
        title: e.title,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt?.toISOString() ?? null,
        location: e.location,
      })),
      tasks: [...tasksOverdue, ...tasksDue].map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueAt: t.dueAt?.toISOString() ?? null,
        overdue: Boolean(
          t.dueAt &&
            DateTime.fromJSDate(t.dueAt).setZone(timezone) < dayStart,
        ),
      })),
      trips: trips.map((t) => ({
        id: t.id,
        title: t.title,
        destination: t.destination,
        startDate: t.startDate?.toISOString() ?? null,
        status: t.status,
      })),
      financeAlerts: financeAlerts.map((a) => ({
        id: a.id,
        symbol: a.symbol,
        condition: a.condition,
        threshold: a.threshold,
      })),
      headline,
    };
  }

  async getOrCreate(
    userId: string,
    opts?: { date?: string; force?: boolean; sendPush?: boolean },
  ) {
    const timezone = await this.getTimezone(userId);
    const day = opts?.date
      ? DateTime.fromISO(opts.date, { zone: timezone })
      : DateTime.now().setZone(timezone);
    const date = day.toISODate()!;

    if (!opts?.force) {
      const existing = await this.prisma.dailySummary.findUnique({
        where: { userId_date: { userId, date } },
      });
      if (existing) {
        return {
          id: existing.id,
          date: existing.date,
          timezone: existing.timezone,
          payload: existing.payload as DailySummaryPayload,
          pushSentAt: existing.pushSentAt,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          cached: true,
        };
      }
    }

    const payload = await this.buildPayload(userId, timezone, date);
    const saved = await this.prisma.dailySummary.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        timezone,
        payload,
      },
      update: {
        timezone,
        payload,
      },
    });

    let pushSentAt = saved.pushSentAt;
    if (opts?.sendPush && !pushSentAt) {
      const result = await this.notificationsService.sendToUser(userId, {
        title: 'ORBIT Daily Summary',
        body: payload.headline,
        data: {
          type: 'DAILY_SUMMARY',
          date: payload.date,
        },
      });
      if (!result.skipped && result.sent > 0) {
        const updated = await this.prisma.dailySummary.update({
          where: { id: saved.id },
          data: { pushSentAt: new Date() },
        });
        pushSentAt = updated.pushSentAt;
      }
    }

    return {
      id: saved.id,
      date: saved.date,
      timezone: saved.timezone,
      payload,
      pushSentAt,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
      cached: false,
    };
  }

  /** Users whose local time is currently HH:mm (default 07:00). */
  async listUsersAtLocalTime(hour = 7, minute = 0) {
    const profiles = await this.prisma.userProfile.findMany({
      select: { userId: true, timezone: true },
    });
    const matched: string[] = [];
    for (const p of profiles) {
      const tz = p.timezone || 'Asia/Dubai';
      const now = DateTime.now().setZone(tz);
      if (now.hour === hour && now.minute === minute) {
        matched.push(p.userId);
      }
    }

    // Also include users with no profile (default TZ) once
    if (
      DateTime.now().setZone('Asia/Dubai').hour === hour &&
      DateTime.now().setZone('Asia/Dubai').minute === minute
    ) {
      const withProfile = new Set(profiles.map((p) => p.userId));
      const users = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const u of users) {
        if (!withProfile.has(u.id) && !matched.includes(u.id)) {
          matched.push(u.id);
        }
      }
    }

    return matched;
  }
}
