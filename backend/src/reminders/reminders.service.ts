import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ReminderRecurrence,
  ReminderType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateReminderDto } from './dto/reminder.dto';

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
  constructor(private readonly prisma: PrismaService) {}

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

  listForUser(
    userId: string,
    filters?: { type?: ReminderType; isActive?: boolean },
  ) {
    return this.prisma.reminder.findMany({
      where: {
        userId,
        ...(filters?.type ? { type: filters.type } : {}),
        ...(filters?.isActive !== undefined
          ? { isActive: filters.isActive }
          : {}),
      },
      orderBy: { remindAt: 'asc' },
    });
  }

  async updateForUser(userId: string, id: string, dto: UpdateReminderDto) {
    const reminder = await this.prisma.reminder.findFirst({
      where: { id, userId },
    });
    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    return this.prisma.reminder.update({
      where: { id },
      data: {
        ...(dto.isCompleted !== undefined
          ? { isCompleted: dto.isCompleted }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
      },
    });
  }
}
