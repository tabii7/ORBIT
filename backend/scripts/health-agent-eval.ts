/**
 * Live Health agent eval (OpenAI + real DB).
 * Skips cleanly when OPENAI_API_KEY is unset.
 *
 *   npm run test:health-eval
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  ReminderLogStatus,
  ReminderRecurrence,
  ReminderType,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RemindersModule } from '../src/reminders/reminders.module';
import { SymptomsModule } from '../src/symptoms/symptoms.module';
import { HealthDocumentsModule } from '../src/health-documents/health-documents.module';
import { AiModule } from '../src/ai/ai.module';
import { HealthAgentService } from '../src/ai/health/health-agent.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RemindersModule,
    SymptomsModule,
    HealthDocumentsModule,
    AiModule,
  ],
})
class EvalModule {}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`ASSERT: ${message}`);
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.log('SKIP health-agent eval: OPENAI_API_KEY not set');
    return;
  }

  const app = await NestFactory.createApplicationContext(EvalModule, {
    logger: ['error', 'warn'],
  });
  const agent = app.get(HealthAgentService);
  const prisma = app.get(PrismaService);

  const email = `health-eval-${Date.now()}@orbit.test`;
  const passwordHash = await bcrypt.hash('EvalPass@123', 10);
  const user = await prisma.user.create({
    data: {
      email,
      fullName: 'Health Eval User',
      passwordHash,
      role: Role.USER,
      profile: { create: { timezone: 'Asia/Dubai' } },
    },
  });
  const userId = user.id;

  const chat = (message: string) =>
    agent.chat({ userId, userMessage: message, history: [] });

  try {
    console.log('1) allergy…');
    let result = await chat('I am allergic to penicillin');
    assert(
      result.actions.some((a) => a.type === 'MEDICAL_PROFILE_UPDATED'),
      'expected MEDICAL_PROFILE_UPDATED',
    );
    let medical = await prisma.medicalProfile.findUnique({ where: { userId } });
    assert(
      medical?.allergies.some((a) => /penicillin/i.test(a)),
      'penicillin allergy not stored',
    );

    console.log('2) metformin reminder…');
    result = await chat(
      'Remind me metformin 500mg daily at 08:00 and 20:00',
    );
    assert(
      result.actions.some((a) => a.type === 'REMINDER_CREATED'),
      'expected REMINDER_CREATED',
    );
    medical = await prisma.medicalProfile.findUnique({ where: { userId } });
    assert(
      medical?.currentMedications.some((m) => /metformin/i.test(m)),
      'metformin not on profile',
    );

    console.log('3) cancel metformin…');
    const before = await prisma.reminder.findFirst({
      where: {
        userId,
        isActive: true,
        OR: [
          { medicineName: { contains: 'metformin', mode: 'insensitive' } },
          { title: { contains: 'metformin', mode: 'insensitive' } },
        ],
      },
    });
    assert(before, 'metformin reminder missing before cancel');
    result = await chat('Cancel my metformin reminder');
    assert(
      result.actions.some(
        (a) => a.type === 'REMINDER_CANCELLED' || a.type === 'REMINDER_UPDATED',
      ),
      'expected cancel/update action',
    );
    const after = await prisma.reminder.findUnique({ where: { id: before!.id } });
    assert(
      after?.isActive === false || after?.isCompleted === true,
      'reminder still active',
    );

    console.log('4) log dose…');
    const reminder = await prisma.reminder.create({
      data: {
        userId,
        type: ReminderType.MEDICINE,
        title: 'Take vitamin D',
        medicineName: 'Vitamin D',
        dosage: '1000 IU',
        remindAt: new Date(Date.now() - 60_000),
        recurrence: ReminderRecurrence.DAILY,
        timesOfDay: ['09:00'],
        timezone: 'Asia/Dubai',
      },
    });
    result = await chat(
      `I took my vitamin D dose for reminder ${reminder.id}`,
    );
    assert(
      result.actions.some((a) => a.type === 'DOSE_LOGGED'),
      'expected DOSE_LOGGED',
    );
    const log = await prisma.reminderLog.findFirst({
      where: { reminderId: reminder.id, status: ReminderLogStatus.TAKEN },
    });
    assert(log, 'TAKEN log missing');

    console.log('5) symptom…');
    result = await chat('Headache severity 6 since noon');
    assert(
      result.actions.some((a) => a.type === 'SYMPTOM_LOGGED'),
      'expected SYMPTOM_LOGGED',
    );
    const entry = await prisma.symptomEntry.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    assert(entry?.severity === 6, 'severity not 6');
    assert(
      entry?.symptoms.some((s) => /headache/i.test(s)),
      'headache not logged',
    );

    console.log('6) profile question…');
    result = await chat('What is on my health profile?');
    assert(result.message.length > 10, 'empty assistant reply');
    assert(
      /penicillin|allerg|medication|health|profile/i.test(result.message),
      'reply missing health context',
    );

    console.log('OK all health-agent eval scenarios passed');
  } finally {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
