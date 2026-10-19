import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReminderRecurrence, ReminderType } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from '../reminders/reminders.service';
import { GoogleCalendarService } from './google-calendar.service';
import {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from './dto/productivity.dto';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly remindersService: RemindersService,
    private readonly googleCalendarService: GoogleCalendarService,
  ) {}

  list(userId: string, from?: Date, to?: Date) {
    return this.prisma.calendarEvent.findMany({
      where: {
        userId,
        ...(from || to
          ? {
              startAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { startAt: 'asc' },
    });
  }

  async get(userId: string, id: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, userId },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    return event;
  }

  async create(
    userId: string,
    dto: CreateCalendarEventDto,
    timezone = 'Asia/Dubai',
  ) {
    const startAt = new Date(dto.startAt);
    let reminderId: string | undefined;

    if (
      dto.remindMinutesBefore != null &&
      dto.remindMinutesBefore > 0 &&
      Number.isFinite(dto.remindMinutesBefore)
    ) {
      const remindAt = DateTime.fromJSDate(startAt)
        .minus({ minutes: dto.remindMinutesBefore })
        .toJSDate();
      const reminder = await this.remindersService.createReminder(userId, {
        type: ReminderType.TASK,
        title: `Upcoming: ${dto.title}`,
        description: dto.location
          ? `${dto.description || ''} @ ${dto.location}`.trim()
          : dto.description,
        remindAt,
        recurrence: ReminderRecurrence.ONCE,
        timezone,
      });
      reminderId = reminder.id;
    }

    let externalProvider: string | undefined;
    let externalEventId: string | undefined;
    let externalEtag: string | undefined;

    try {
      const linked = await this.googleCalendarService.status(userId);
      if (linked.connected) {
        const remote = await this.googleCalendarService.insertEvent(userId, {
          title: dto.title.trim(),
          description: dto.description,
          location: dto.location,
          startAt,
          endAt: dto.endAt ? new Date(dto.endAt) : undefined,
          allDay: dto.allDay,
          timezone,
        });
        if (remote?.id) {
          externalProvider = 'google';
          externalEventId = remote.id;
          externalEtag = remote.etag;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Google push on create failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.prisma.calendarEvent.create({
      data: {
        userId,
        title: dto.title.trim(),
        description: dto.description,
        location: dto.location,
        startAt,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        allDay: dto.allDay ?? false,
        reminderId,
        externalProvider,
        externalEventId,
        externalEtag,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCalendarEventDto) {
    const existing = await this.get(userId, id);
    const updated = await this.prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.startAt !== undefined
          ? { startAt: new Date(dto.startAt) }
          : {}),
        ...(dto.endAt !== undefined
          ? { endAt: dto.endAt ? new Date(dto.endAt) : null }
          : {}),
        ...(dto.allDay !== undefined ? { allDay: dto.allDay } : {}),
      },
    });

    if (
      existing.externalProvider === 'google' &&
      existing.externalEventId
    ) {
      try {
        const profile = await this.prisma.userProfile.findUnique({
          where: { userId },
        });
        await this.googleCalendarService.updateEvent(
          userId,
          existing.externalEventId,
          {
            title: updated.title,
            description: updated.description,
            location: updated.location,
            startAt: updated.startAt,
            endAt: updated.endAt,
            allDay: updated.allDay,
            timezone: profile?.timezone || 'Asia/Dubai',
          },
        );
      } catch (error) {
        this.logger.warn(
          `Google push on update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return updated;
  }

  async remove(userId: string, id: string) {
    const existing = await this.get(userId, id);
    if (
      existing.externalProvider === 'google' &&
      existing.externalEventId
    ) {
      try {
        await this.googleCalendarService.deleteEvent(
          userId,
          existing.externalEventId,
        );
      } catch (error) {
        this.logger.warn(
          `Google delete failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { ok: true, deleted: true, id };
  }

  listForDay(userId: string, day: DateTime) {
    const start = day.startOf('day').toUTC().toJSDate();
    const end = day.endOf('day').toUTC().toJSDate();
    return this.list(userId, start, end);
  }
}
