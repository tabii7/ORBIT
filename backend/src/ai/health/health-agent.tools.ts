import {
  HealthDocumentCategory,
  ReminderLogStatus,
  ReminderRecurrence,
  ReminderType,
} from '@prisma/client';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { RemindersService } from '../../reminders/reminders.service';
import { SymptomsService } from '../../symptoms/symptoms.service';
import { HealthDocumentsService } from '../../health-documents/health-documents.service';
import { resolveRemindAt } from '../../common/time/remind-at';

export type HealthAgentAction = Record<string, unknown>;

export function createHealthAgentTools(deps: {
  userId: string;
  timezone: string;
  prisma: PrismaService;
  remindersService: RemindersService;
  symptomsService: SymptomsService;
  healthDocumentsService: HealthDocumentsService;
  actions: HealthAgentAction[];
}) {
  const {
    userId,
    timezone,
    prisma,
    remindersService,
    symptomsService,
    healthDocumentsService,
    actions,
  } = deps;

  const uniqueMerge = (existing: string[], incoming?: string[]) => {
    if (!incoming?.length) return existing;
    const set = new Set(
      [...existing, ...incoming].map((v) => v.trim()).filter(Boolean),
    );
    return Array.from(set);
  };

  const getMedicalProfile = tool(
    async () => {
      const medical = await prisma.medicalProfile.findUnique({
        where: { userId },
      });
      return JSON.stringify(
        medical ?? { message: 'No medical profile saved yet.' },
      );
    },
    {
      name: 'get_medical_profile',
      description: 'Fetch the latest medical profile from the database.',
      schema: z.object({}),
    },
  );

  const saveMedicalInfo = tool(
    async (input) => {
      const current = await prisma.medicalProfile.findUnique({
        where: { userId },
      });

      const next = {
        currentSituation:
          input.current_situation ?? current?.currentSituation ?? null,
        conditions: uniqueMerge(current?.conditions ?? [], input.conditions),
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

      const saved = await prisma.medicalProfile.upsert({
        where: { userId },
        create: { userId, ...next },
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
        'Extract and SAVE medical details from chat. Use for conditions, allergies, medications, blood type, emergency contact, situation, notes.',
      schema: z.object({
        current_situation: z.string().optional(),
        conditions: z.array(z.string()).optional(),
        allergies: z.array(z.string()).optional(),
        current_medications: z.array(z.string()).optional(),
        blood_type: z.string().optional(),
        emergency_contact_name: z.string().optional(),
        emergency_contact_phone: z.string().optional(),
        notes: z.string().optional(),
      }),
    },
  );

  const listReminders = tool(
    async (input) => {
      const typeMap: Record<string, ReminderType> = {
        MEDICINE: ReminderType.MEDICINE,
        APPOINTMENT: ReminderType.APPOINTMENT,
        TASK: ReminderType.TASK,
        GENERAL: ReminderType.GENERAL,
      };
      const key = input.type?.toUpperCase();
      const type = key ? typeMap[key] : undefined;
      const rows = await remindersService.listForUser(userId, {
        type,
        isActive: true,
      });
      return JSON.stringify(rows);
    },
    {
      name: 'list_reminders',
      description: 'List active reminders for this user.',
      schema: z.object({
        type: z
          .enum([
            'MEDICINE',
            'APPOINTMENT',
            'TASK',
            'GENERAL',
            'medicine',
            'appointment',
            'task',
            'general',
          ])
          .optional(),
      }),
    },
  );

  const listDueReminders = tool(
    async () => {
      const rows = await remindersService.listDueForUser(userId);
      return JSON.stringify(rows);
    },
    {
      name: 'list_due_reminders',
      description: 'List reminders that are due now (remindAt <= now).',
      schema: z.object({}),
    },
  );

  const createMedicineReminder = tool(
    async (input) => {
      const recurrence =
        (input.recurrence?.toUpperCase() as ReminderRecurrence) ||
        ReminderRecurrence.ONCE;

      const remindAt = resolveRemindAt({
        remindAtIso: input.remind_at_iso,
        timesOfDay: input.times_of_day,
        timezone,
      });

      const reminder = await remindersService.createMedicineReminder(userId, {
        title: input.title,
        medicineName: input.medicine_name,
        dosage: input.dosage,
        description: input.description,
        remindAt,
        recurrence,
        timesOfDay: input.times_of_day ?? [],
        timezone,
      });

      const current = await prisma.medicalProfile.findUnique({
        where: { userId },
      });
      const meds = uniqueMerge(current?.currentMedications ?? [], [
        input.medicine_name,
      ]);
      await prisma.medicalProfile.upsert({
        where: { userId },
        create: { userId, currentMedications: meds },
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
        timezone,
      });
    },
    {
      name: 'create_medicine_reminder',
      description:
        'Create a medicine reminder when the user mentions medicine schedule/times.',
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
      const remindAt = resolveRemindAt({
        remindAtIso: input.remind_at_iso,
        timezone,
      });

      const reminder = await remindersService.createReminder(userId, {
        type: ReminderType.APPOINTMENT,
        title: input.title,
        description: input.description,
        remindAt,
        recurrence: ReminderRecurrence.ONCE,
        timezone,
      });

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
        timezone,
      });
    },
    {
      name: 'create_appointment_reminder',
      description:
        'Create a doctor/appointment reminder when the user mentions an appointment.',
      schema: z.object({
        title: z.string(),
        description: z.string().optional(),
        remind_at_iso: z
          .string()
          .describe('ISO datetime for the appointment reminder'),
      }),
    },
  );

  const updateReminder = tool(
    async (input) => {
      const updated = await remindersService.updateForUser(
        userId,
        input.reminder_id,
        {
          title: input.title,
          description: input.description,
          medicineName: input.medicine_name,
          dosage: input.dosage,
          remindAt: input.remind_at_iso,
          recurrence: input.recurrence
            ? (input.recurrence.toUpperCase() as ReminderRecurrence)
            : undefined,
          timesOfDay: input.times_of_day,
          isActive: input.is_active,
          isCompleted: input.is_completed,
        },
      );

      actions.push({
        type: 'REMINDER_UPDATED',
        data: {
          id: updated.id,
          title: updated.title,
          remindAt: updated.remindAt,
          isActive: updated.isActive,
        },
      });

      return JSON.stringify({ ok: true, reminder: updated });
    },
    {
      name: 'update_reminder',
      description: 'Update an existing reminder by id.',
      schema: z.object({
        reminder_id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        medicine_name: z.string().optional(),
        dosage: z.string().optional(),
        remind_at_iso: z.string().optional(),
        times_of_day: z.array(z.string()).optional(),
        recurrence: z
          .enum(['ONCE', 'DAILY', 'WEEKLY', 'once', 'daily', 'weekly'])
          .optional(),
        is_active: z.boolean().optional(),
        is_completed: z.boolean().optional(),
      }),
    },
  );

  const cancelReminder = tool(
    async (input) => {
      const cancelled = await remindersService.deleteForUser(
        userId,
        input.reminder_id,
      );
      actions.push({
        type: 'REMINDER_CANCELLED',
        data: { id: cancelled.id, title: cancelled.title },
      });
      return JSON.stringify({ ok: true, reminder: cancelled });
    },
    {
      name: 'cancel_reminder',
      description: 'Cancel/deactivate a reminder by id.',
      schema: z.object({
        reminder_id: z.string(),
      }),
    },
  );

  const logDose = tool(
    async (input) => {
      const status = input.status.toUpperCase() as ReminderLogStatus;
      const result = await remindersService.logForUser(
        userId,
        input.reminder_id,
        {
          status,
          note: input.note,
          snoozeMinutes: input.snooze_minutes,
        },
      );
      actions.push({
        type: 'DOSE_LOGGED',
        data: {
          reminderId: input.reminder_id,
          status,
          logId: result.log.id,
        },
      });
      return JSON.stringify({ ok: true, ...result });
    },
    {
      name: 'log_dose',
      description:
        'Log a medicine dose as TAKEN, SKIPPED, or SNOOZED for a reminder.',
      schema: z.object({
        reminder_id: z.string(),
        status: z.enum([
          'TAKEN',
          'SKIPPED',
          'SNOOZED',
          'taken',
          'skipped',
          'snoozed',
        ]),
        note: z.string().optional(),
        snooze_minutes: z.number().int().optional(),
      }),
    },
  );

  const logSymptom = tool(
    async (input) => {
      const entry = await symptomsService.create(userId, {
        symptoms: input.symptoms,
        severity: input.severity,
        notes: input.notes,
        relatedMedications: input.related_medications,
        recordedAt: input.recorded_at_iso,
      });
      actions.push({
        type: 'SYMPTOM_LOGGED',
        data: {
          id: entry.id,
          symptoms: entry.symptoms,
          severity: entry.severity,
        },
      });
      return JSON.stringify({ ok: true, entry });
    },
    {
      name: 'log_symptom',
      description: 'Log a symptom check-in with severity 1-10.',
      schema: z.object({
        symptoms: z.array(z.string()),
        severity: z.number().int().min(1).max(10),
        notes: z.string().optional(),
        related_medications: z.array(z.string()).optional(),
        recorded_at_iso: z.string().optional(),
      }),
    },
  );

  const listSymptoms = tool(
    async () => {
      const rows = await symptomsService.list(userId);
      return JSON.stringify(rows.slice(0, 20));
    },
    {
      name: 'list_symptoms',
      description: 'List recent symptom diary entries.',
      schema: z.object({}),
    },
  );

  const saveHealthDocumentNote = tool(
    async (input) => {
      const category = (input.category?.toUpperCase() ||
        'OTHER') as HealthDocumentCategory;
      const doc = await healthDocumentsService.create(userId, {
        title: input.title,
        category,
        fileUrl: input.file_url,
        notes: input.notes,
        recordedAt: input.recorded_at_iso,
      });
      actions.push({
        type: 'HEALTH_DOCUMENT_SAVED',
        data: {
          id: doc.id,
          title: doc.title,
          category: doc.category,
        },
      });
      return JSON.stringify({ ok: true, document: doc });
    },
    {
      name: 'save_health_document_note',
      description:
        'Save a lab/prescription/imaging/other health document note or link.',
      schema: z.object({
        title: z.string(),
        category: z
          .enum([
            'LAB',
            'PRESCRIPTION',
            'IMAGING',
            'OTHER',
            'lab',
            'prescription',
            'imaging',
            'other',
          ])
          .optional(),
        file_url: z.string().optional(),
        notes: z.string().optional(),
        recorded_at_iso: z.string().optional(),
      }),
    },
  );

  const getHealthSummary = tool(
    async () => {
      const [medical, reminders, symptoms, documents] = await Promise.all([
        prisma.medicalProfile.findUnique({ where: { userId } }),
        remindersService.listForUser(userId, { isActive: true }),
        symptomsService.list(userId),
        healthDocumentsService.list(userId),
      ]);
      return JSON.stringify({
        medicalProfile: medical,
        nextReminders: reminders.slice(0, 5),
        recentSymptoms: symptoms.slice(0, 5),
        recentDocuments: documents.slice(0, 5),
        timezone,
      });
    },
    {
      name: 'get_health_summary',
      description:
        'Get a compact health summary: profile, next reminders, recent symptoms and documents.',
      schema: z.object({}),
    },
  );

  const searchHealthDocuments = tool(
    async (input) => {
      const q = input.query.trim().toLowerCase();
      const docs = await healthDocumentsService.list(userId);
      const matches = docs
        .filter((d) => {
          const hay = `${d.title} ${d.notes ?? ''} ${d.extractedText ?? ''}`.toLowerCase();
          return hay.includes(q);
        })
        .slice(0, 5)
        .map((d) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          extractStatus: d.extractStatus,
          snippet: (d.extractedText || d.notes || '').slice(0, 500),
        }));
      return JSON.stringify({ query: input.query, matches });
    },
    {
      name: 'search_health_documents',
      description:
        'Search the user health documents by keyword across title/notes/extracted text.',
      schema: z.object({
        query: z.string(),
      }),
    },
  );

  const getHealthDocument = tool(
    async (input) => {
      const docs = await healthDocumentsService.list(userId);
      const doc = docs.find((d) => d.id === input.document_id);
      if (!doc) {
        return JSON.stringify({ error: 'Document not found' });
      }
      return JSON.stringify({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        extractStatus: doc.extractStatus,
        fileUrl: doc.fileUrl,
        notes: doc.notes,
        extractedText: (doc.extractedText || '').slice(0, 12_000),
      });
    },
    {
      name: 'get_health_document',
      description: 'Fetch one health document including extracted text.',
      schema: z.object({
        document_id: z.string(),
      }),
    },
  );

  return [
    getMedicalProfile,
    saveMedicalInfo,
    listReminders,
    listDueReminders,
    createMedicineReminder,
    createAppointmentReminder,
    updateReminder,
    cancelReminder,
    logDose,
    logSymptom,
    listSymptoms,
    saveHealthDocumentNote,
    searchHealthDocuments,
    getHealthDocument,
    getHealthSummary,
  ];
}
