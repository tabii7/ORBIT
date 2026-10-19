import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ReminderLogStatus,
  ReminderRecurrence,
  ReminderType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  advanceRemindAt,
  resolveRemindAt,
} from '../common/time/remind-at';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateReminderDto,
  LogReminderDto,
  UpdateReminderDto,
} from './dto/reminder.dto';

export type CreateReminderInput = {
  type?: ReminderType;
  title: string;
  medicineName?: string;
  dosage?: string;
  description?: string;
  remindAt: Date;
  recurrence?: ReminderRecurrence;
  timesOfDay?: string[];
  timezone?: string;
};

export type CreateMedicineReminderInput = CreateReminderInput & {
  medicineName: string;
};

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  createReminder(userId: string, input: CreateReminderInput) {
    return this.prisma.reminder.create({
      data: {
        userId,
        type: input.type ?? ReminderType.GENERAL,
        title: input.title,
        medicineName: input.medicineName,
        dosage: input.dosage,
        description: input.description,
        remindAt: input.remindAt,
        recurrence: input.recurrence ?? ReminderRecurrence.ONCE,
        timesOfDay: input.timesOfDay ?? [],
        timezone: input.timezone ?? 'Asia/Dubai',
      },
    });
  }

  createMedicineReminder(userId: string, input: CreateMedicineReminderInput) {
    return this.createReminder(userId, {
      ...input,
      type: ReminderType.MEDICINE,
    });
  }

  async createFromDto(userId: string, dto: CreateReminderDto) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    const timezone = dto.timezone || profile?.timezone || 'Asia/Dubai';
    const remindAt = resolveRemindAt({
      remindAtIso: dto.remindAt,
      timesOfDay: dto.timesOfDay,
      timezone,
    });

    return this.createReminder(userId, {
      type: dto.type,
      title: dto.title,
      description: dto.description,
      medicineName: dto.medicineName,
      dosage: dto.dosage,
      remindAt,
      recurrence: dto.recurrence,
      timesOfDay: dto.timesOfDay,
      timezone,
    });
  }

  listForUser(
    userId: string,
    filters?: {
      type?: ReminderType;
      isActive?: boolean;
      from?: string;
      to?: string;
    },
  ) {
    return this.prisma.reminder.findMany({
      where: {
        userId,
        ...(filters?.type ? { type: filters.type } : {}),
        ...(filters?.isActive !== undefined
          ? { isActive: filters.isActive }
          : {}),
        ...(filters?.from || filters?.to
          ? {
              remindAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { remindAt: 'desc' }],
    });
  }

  async getForUser(userId: string, id: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id, userId },
      include: {
        logs: {
          orderBy: { takenAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }
    return reminder;
  }

  async updateForUser(userId: string, id: string, dto: UpdateReminderDto) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id, userId },
    });
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    const timezone = dto.timezone ?? reminder.timezone;
    const timesOfDay = dto.timesOfDay ?? reminder.timesOfDay;
    let remindAt = reminder.remindAt;
    if (dto.remindAt || dto.timesOfDay || dto.timezone) {
      remindAt = resolveRemindAt({
        remindAtIso: dto.remindAt,
        timesOfDay,
        timezone,
      });
    }

    return this.prisma.reminder.update({
      where: { id },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.medicineName !== undefined
          ? { medicineName: dto.medicineName }
          : {}),
        ...(dto.dosage !== undefined ? { dosage: dto.dosage } : {}),
        ...(dto.recurrence !== undefined ? { recurrence: dto.recurrence } : {}),
        ...(dto.timesOfDay !== undefined ? { timesOfDay: dto.timesOfDay } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        ...(dto.isCompleted !== undefined
          ? { isCompleted: dto.isCompleted }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        remindAt,
      },
    });
  }

  async deleteForUser(userId: string, id: string) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id, userId },
    });
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    await this.prisma.reminder.delete({ where: { id } });

    return {
      ok: true,
      deleted: true,
      id: reminder.id,
      title: reminder.title,
    };
  }

  listDueForUser(userId: string, now = new Date()) {
    return this.prisma.reminder.findMany({
      where: {
        userId,
        isActive: true,
        isCompleted: false,
        remindAt: { lte: now },
      },
      orderBy: { remindAt: 'asc' },
    });
  }

  listDue(now = new Date()) {
    return this.prisma.reminder.findMany({
      where: {
        isActive: true,
        isCompleted: false,
        remindAt: { lte: now },
      },
      orderBy: { remindAt: 'asc' },
    });
  }

  /**
   * Mobile-friendly schedule list (reminders now; extensible later).
   */
  async listSchedules(
    userId: string,
    query?: {
      type?: ReminderType;
      status?: 'UPCOMING' | 'DUE' | 'COMPLETED' | 'ALL';
      from?: string;
      to?: string;
    },
  ) {
    const now = new Date();
    const status = query?.status ?? 'ALL';

    const where: {
      userId: string;
      type?: ReminderType;
      isActive?: boolean;
      isCompleted?: boolean;
      remindAt?: { gte?: Date; lte?: Date };
    } = { userId };

    if (query?.type) {
      where.type = query.type;
    }

    if (status === 'UPCOMING') {
      where.isActive = true;
      where.isCompleted = false;
      where.remindAt = {
        gte: query?.from ? new Date(query.from) : now,
        ...(query?.to ? { lte: new Date(query.to) } : {}),
      };
    } else if (status === 'DUE') {
      where.isActive = true;
      where.isCompleted = false;
      where.remindAt = {
        lte: query?.to ? new Date(query.to) : now,
        ...(query?.from ? { gte: new Date(query.from) } : {}),
      };
    } else if (status === 'COMPLETED') {
      where.isCompleted = true;
      if (query?.from || query?.to) {
        where.remindAt = {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        };
      }
    } else {
      // ALL
      if (query?.from || query?.to) {
        where.remindAt = {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        };
      }
    }

    const rows = await this.prisma.reminder.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { remindAt: 'desc' }],
    });

    const items = rows.map((r) => {
      const isDue =
        r.isActive && !r.isCompleted && r.remindAt.getTime() <= now.getTime();
      const scheduleStatus = r.isCompleted
        ? 'COMPLETED'
        : !r.isActive
          ? 'INACTIVE'
          : isDue
            ? 'DUE'
            : 'UPCOMING';

      return {
        id: r.id,
        source: 'REMINDER' as const,
        type: r.type,
        title: r.title,
        description: r.description,
        medicineName: r.medicineName,
        dosage: r.dosage,
        scheduledAt: r.remindAt,
        timezone: r.timezone,
        recurrence: r.recurrence,
        timesOfDay: r.timesOfDay,
        isActive: r.isActive,
        isCompleted: r.isCompleted,
        isDue,
        status: scheduleStatus,
      };
    });

    return {
      total: items.length,
      status,
      now: now.toISOString(),
      items,
    };
  }

  async logForUser(userId: string, id: string, dto: LogReminderDto) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id, userId },
    });
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    const log = await this.prisma.reminderLog.create({
      data: {
        reminderId: id,
        userId,
        status: dto.status,
        note: dto.note,
      },
    });

    if (dto.status === ReminderLogStatus.SNOOZED) {
      const minutes = dto.snoozeMinutes ?? 30;
      const next = new Date(Date.now() + minutes * 60 * 1000);
      await this.prisma.reminder.update({
        where: { id },
        data: { remindAt: next, lastFiredAt: new Date() },
      });
      return { log, reminder: await this.getForUser(userId, id) };
    }

    if (dto.status === ReminderLogStatus.TAKEN || dto.status === ReminderLogStatus.SKIPPED) {
      await this.advanceOrComplete(reminder.id);
    }

    return { log, reminder: await this.getForUser(userId, id) };
  }

  async advanceOrComplete(reminderId: string) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
    });
    if (!reminder) return null;

    const next = advanceRemindAt({
      currentRemindAt: reminder.remindAt,
      recurrence: reminder.recurrence,
      timesOfDay: reminder.timesOfDay,
      timezone: reminder.timezone,
    });

    if (!next) {
      return this.prisma.reminder.update({
        where: { id: reminderId },
        data: {
          isCompleted: true,
          isActive: false,
          lastFiredAt: new Date(),
        },
      });
    }

    return this.prisma.reminder.update({
      where: { id: reminderId },
      data: {
        remindAt: next,
        lastFiredAt: new Date(),
        isCompleted: false,
        isActive: true,
      },
    });
  }

  /** Marks due reminders' lastFiredAt and sends FCM push when configured. */
  @Cron(CronExpression.EVERY_MINUTE)
  async processDueReminders() {
    const due = await this.listDue();
    const now = new Date();
    for (const reminder of due) {
      const shouldFire =
        !reminder.lastFiredAt || reminder.lastFiredAt < reminder.remindAt;
      if (!shouldFire) continue;

      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { lastFiredAt: now },
      });

      try {
        const result = await this.notificationsService.notifyReminder(reminder);
        this.logger.debug(
          `Reminder push id=${reminder.id} sent=${'sent' in result ? result.sent : 0} skipped=${result.skipped}`,
        );
      } catch (error) {
        this.logger.warn(
          `Reminder push failed id=${reminder.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
