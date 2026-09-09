import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReminderRecurrence, ReminderType } from '@prisma/client';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { RemindersService } from '../reminders/reminders.service';

type ChatHistoryItem = {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
};

@Injectable()
export class MedicalAiService {
  private readonly logger = new Logger(MedicalAiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly remindersService: RemindersService,
  ) {}

  async chat(params: {
    userId: string;
    userMessage: string;
    history: ChatHistoryItem[];
  }) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const modelName =
      this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    const [user, profile] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { fullName: true },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId: params.userId },
      }),
    ]);

    const timezone = profile?.timezone || 'Asia/Dubai';
    const actions: Array<Record<string, unknown>> = [];

    const uniqueMerge = (existing: string[], incoming?: string[]) => {
      if (!incoming?.length) return existing;
      const set = new Set(
        [...existing, ...incoming].map((v) => v.trim()).filter(Boolean),
      );
      return Array.from(set);
    };

    const getMedicalProfile = tool(
      async () => {
        const medical = await this.prisma.medicalProfile.findUnique({
          where: { userId: params.userId },
        });
        return JSON.stringify(
          medical ?? { message: 'No medical profile saved yet.' },
        );
      },
      {
        name: 'get_medical_profile',
        description:
          'Fetch the latest medical profile from database for this user.',
        schema: z.object({}),
      },
    );

    const saveMedicalInfo = tool(
      async (input) => {
        const current = await this.prisma.medicalProfile.findUnique({
          where: { userId: params.userId },
        });

        const next = {
          currentSituation:
            input.current_situation ?? current?.currentSituation ?? null,
          conditions: uniqueMerge(
            current?.conditions ?? [],
            input.conditions,
          ),
          allergies: uniqueMerge(current?.allergies ?? [], input.allergies),
          currentMedications: uniqueMerge(
            current?.currentMedications ?? [],
            input.current_medications,
          ),
          bloodType: input.blood_type ?? current?.bloodType ?? null,
          emergencyContactName:
            input.emergency_contact_name ??
            current?.emergencyContactName ??
            null,
          emergencyContactPhone:
            input.emergency_contact_phone ??
            current?.emergencyContactPhone ??
            null,
          notes: input.notes ?? current?.notes ?? null,
        };

        const saved = await this.prisma.medicalProfile.upsert({
          where: { userId: params.userId },
          create: {
            userId: params.userId,
            ...next,
          },
          update: next,
        });

        actions.push({
          type: 'MEDICAL_PROFILE_UPDATED',
          data: {
            currentSituation: saved.currentSituation,
            conditions: saved.conditions,
            allergies: saved.allergies,
            currentMedications: saved.currentMedications,
            bloodType: saved.bloodType,
            emergencyContactName: saved.emergencyContactName,
            emergencyContactPhone: saved.emergencyContactPhone,
            notes: saved.notes,
          },
        });

        return JSON.stringify({ ok: true, medicalProfile: saved });
      },
      {
        name: 'save_medical_info',
        description:
          'Extract and SAVE medical details from the user chat into the database. Use whenever the user mentions conditions, allergies, medications, blood type, emergency contact, current health situation, or notes.',
        schema: z.object({
          current_situation: z
            .string()
            .optional()
            .describe('User current health situation summary'),
          conditions: z
            .array(z.string())
            .optional()
            .describe('Medical conditions mentioned'),
          allergies: z.array(z.string()).optional(),
          current_medications: z
            .array(z.string())
            .optional()
            .describe('Medicine names mentioned'),
          blood_type: z.string().optional(),
          emergency_contact_name: z.string().optional(),
          emergency_contact_phone: z.string().optional(),
          notes: z.string().optional(),
        }),
      },
    );

    const listReminders = tool(
      async (input) => {
        const type =
          input.type?.toUpperCase() === 'APPOINTMENT'
            ? ReminderType.APPOINTMENT
            : input.type?.toUpperCase() === 'MEDICINE'
              ? ReminderType.MEDICINE
              : undefined;
        const rows = await this.remindersService.listForUser(params.userId, {
          type,
          isActive: true,
        });
        return JSON.stringify(rows);
      },
      {
        name: 'list_reminders',
        description: 'List active reminders for this user from the database.',
        schema: z.object({
          type: z
            .enum(['MEDICINE', 'APPOINTMENT', 'medicine', 'appointment'])
            .optional(),
        }),
      },
    );

    const createMedicineReminder = tool(
      async (input) => {
        const recurrence =
          (input.recurrence?.toUpperCase() as ReminderRecurrence) ||
          ReminderRecurrence.ONCE;

        const remindAt = this.resolveRemindAt(
          input.remind_at_iso,
          input.times_of_day,
          timezone,
        );

        const reminder = await this.remindersService.createMedicineReminder(
          params.userId,
          {
            title: input.title,
            medicineName: input.medicine_name,
            dosage: input.dosage,
            description: input.description,
            remindAt,
            recurrence,
            timesOfDay: input.times_of_day ?? [],
            timezone,
          },
        );

        // Also persist medicine name into medical profile automatically
        const current = await this.prisma.medicalProfile.findUnique({
          where: { userId: params.userId },
        });
        const meds = uniqueMerge(current?.currentMedications ?? [], [
          input.medicine_name,
        ]);
        await this.prisma.medicalProfile.upsert({
          where: { userId: params.userId },
          create: {
            userId: params.userId,
            currentMedications: meds,
          },
          update: { currentMedications: meds },
        });

        actions.push({
          type: 'REMINDER_CREATED',
          data: {
            id: reminder.id,
            type: reminder.type,
            title: reminder.title,
            medicineName: reminder.medicineName,
            remindAt: reminder.remindAt,
            recurrence: reminder.recurrence,
            timesOfDay: reminder.timesOfDay,
          },
        });

        return JSON.stringify({
          ok: true,
          reminderId: reminder.id,
          remindAt: reminder.remindAt,
          recurrence: reminder.recurrence,
        });
      },
      {
        name: 'create_medicine_reminder',
        description:
          'Create a medicine reminder in the database when the user mentions medicine schedule/times.',
        schema: z.object({
          title: z.string(),
          medicine_name: z.string(),
          dosage: z.string().optional(),
          description: z.string().optional(),
          remind_at_iso: z.string().optional(),
          times_of_day: z.array(z.string()).optional(),
          recurrence: z
            .enum(['ONCE', 'DAILY', 'WEEKLY', 'once', 'daily', 'weekly'])
            .optional(),
        }),
      },
    );

    const createAppointmentReminder = tool(
      async (input) => {
        const remindAt = this.resolveRemindAt(
          input.remind_at_iso,
          undefined,
          timezone,
        );

        const reminder = await this.remindersService.createReminder(
          params.userId,
          {
            type: ReminderType.APPOINTMENT,
            title: input.title,
            description: input.description,
            remindAt,
            recurrence: ReminderRecurrence.ONCE,
            timezone,
          },
        );

        actions.push({
          type: 'REMINDER_CREATED',
          data: {
            id: reminder.id,
            type: reminder.type,
            title: reminder.title,
            remindAt: reminder.remindAt,
          },
        });

        return JSON.stringify({
          ok: true,
          reminderId: reminder.id,
          remindAt: reminder.remindAt,
        });
      },
      {
        name: 'create_appointment_reminder',
        description:
          'Create a doctor/appointment reminder in the database when the user mentions an appointment.',
        schema: z.object({
          title: z.string(),
          description: z.string().optional(),
          remind_at_iso: z
            .string()
            .describe('ISO datetime for the appointment reminder'),
        }),
      },
    );

    const medical = await this.prisma.medicalProfile.findUnique({
      where: { userId: params.userId },
    });
    const reminders = await this.remindersService.listForUser(params.userId, {
      isActive: true,
    });

    const model = new ChatOpenAI({
      apiKey,
      model: modelName,
      temperature: 0.2,
    });

    const agent = createReactAgent({
      llm: model,
      tools: [
        getMedicalProfile,
        saveMedicalInfo,
        listReminders,
        createMedicineReminder,
        createAppointmentReminder,
      ],
    });

    const systemPrompt = this.buildSystemPrompt({
      fullName: user?.fullName || 'User',
      timezone,
      medicalContext: medical,
      reminders,
    });

    const historyMessages = params.history.slice(-12).map((m) => {
      if (m.role === 'ASSISTANT') return new AIMessage(m.content);
      if (m.role === 'SYSTEM') return new SystemMessage(m.content);
      return new HumanMessage(m.content);
    });

    const result = await agent.invoke({
      messages: [
        new SystemMessage(systemPrompt),
        ...historyMessages,
        new HumanMessage(params.userMessage),
      ],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const content =
      typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage?.content ?? '');

    return {
      message: content,
      actions,
      model: modelName,
    };
  }

  private buildSystemPrompt(input: {
    fullName: string;
    timezone: string;
    medicalContext: unknown;
    reminders: unknown[];
  }) {
    return [
      'You are ORBIT Health Assistant.',
      `User name: ${input.fullName}`,
      `Timezone: ${input.timezone}`,
      '',
      'Primary behavior:',
      '- Instructions come through chat. You MUST extract useful medical details and SAVE them to the database using tools.',
      '- Do not ask the user to fill forms. Capture what they say and store it.',
      '- When user shares conditions/allergies/medications/situation/blood type/emergency contact → call save_medical_info.',
      '- When user mentions medicine schedule/times → call create_medicine_reminder (and medicine is also saved to profile).',
      '- When user mentions doctor appointment date/time → call create_appointment_reminder.',
      '- When user asks about their health data/reminders → call get_medical_profile / list_reminders and answer from DB.',
      '- Confirm briefly what you saved.',
      '',
      'Hard safety rules:',
      '- Never diagnose, prescribe, change treatment, or replace a doctor.',
      '- You only organize user-provided information and reminders.',
      '',
      `Current medical profile JSON: ${JSON.stringify(input.medicalContext)}`,
      `Current reminders JSON: ${JSON.stringify(input.reminders)}`,
    ].join('\n');
  }

  private resolveRemindAt(
    remindAtIso: string | undefined,
    timesOfDay: string[] | undefined,
    timezone: string,
  ): Date {
    if (remindAtIso) {
      const parsed = new Date(remindAtIso);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const now = new Date();
    const firstTime = timesOfDay?.[0];
    if (firstTime && /^\d{1,2}:\d{2}$/.test(firstTime)) {
      const [hh, mm] = firstTime.split(':').map(Number);
      const candidate = new Date(now);
      candidate.setHours(hh, mm, 0, 0);
      if (candidate <= now) {
        candidate.setDate(candidate.getDate() + 1);
      }
      this.logger.debug(`Resolved remindAt using ${firstTime} (${timezone})`);
      return candidate;
    }

    return new Date(now.getTime() + 60 * 60 * 1000);
  }
}
