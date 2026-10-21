import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitHealthCheckDto } from './dto/health-check.dto';
import {
  HEALTH_CHECK_DISCLAIMER,
  HEALTH_CHECK_QUESTIONS,
  HEALTH_CHECK_VERSION,
  maxPossibleScore,
} from './health-check.questions';

@Injectable()
export class HealthCheckService {
  constructor(private readonly prisma: PrismaService) {}

  getQuestions() {
    return {
      version: HEALTH_CHECK_VERSION,
      disclaimer: HEALTH_CHECK_DISCLAIMER,
      questions: HEALTH_CHECK_QUESTIONS.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options.map((o) => ({
          value: o.value,
          label: o.label,
        })),
      })),
      maxScore: maxPossibleScore(),
    };
  }

  async getLatest(userId: string) {
    await this.ensureActiveUser(userId);
    const latest = await this.prisma.healthCheckResult.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) {
      return {
        hasResult: false,
        result: null,
        disclaimer: HEALTH_CHECK_DISCLAIMER,
      };
    }
    return {
      hasResult: true,
      result: this.toPublic(latest),
      disclaimer: HEALTH_CHECK_DISCLAIMER,
    };
  }

  async list(userId: string, take = 10) {
    await this.ensureActiveUser(userId);
    const rows = await this.prisma.healthCheckResult.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 50),
    });
    return {
      items: rows.map((r) => this.toPublic(r)),
      disclaimer: HEALTH_CHECK_DISCLAIMER,
    };
  }

  async submit(userId: string, dto: SubmitHealthCheckDto) {
    await this.ensureActiveUser(userId);

    const byId = new Map(dto.answers.map((a) => [a.questionId, a.value]));
    if (byId.size !== dto.answers.length) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: { answers: 'Duplicate questionId in answers' },
      });
    }

    const scoredAnswers: Array<{
      questionId: string;
      value: string;
      points: number;
    }> = [];
    let score = 0;

    for (const q of HEALTH_CHECK_QUESTIONS) {
      const value = byId.get(q.id);
      if (!value) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: { answers: `Missing answer for question: ${q.id}` },
        });
      }
      const option = q.options.find((o) => o.value === value);
      if (!option) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: {
            answers: `Invalid option "${value}" for question: ${q.id}`,
          },
        });
      }
      scoredAnswers.push({
        questionId: q.id,
        value: option.value,
        points: option.points,
      });
      score += option.points;
    }

    const maxScore = maxPossibleScore();
    const level = this.levelFromScore(score, maxScore);
    const tips = this.tipsFromAnswers(scoredAnswers);
    const summary = this.summaryForLevel(level, score, maxScore);

    const row = await this.prisma.healthCheckResult.create({
      data: {
        userId,
        version: HEALTH_CHECK_VERSION,
        answers: scoredAnswers as unknown as Prisma.InputJsonValue,
        score,
        maxScore,
        level,
        tips,
        summary,
      },
    });

    return {
      result: this.toPublic(row),
      disclaimer: HEALTH_CHECK_DISCLAIMER,
    };
  }

  private levelFromScore(score: number, maxScore: number): string {
    const ratio = maxScore > 0 ? score / maxScore : 0;
    if (ratio >= 0.75) return 'GOOD';
    if (ratio >= 0.5) return 'FAIR';
    return 'NEEDS_ATTENTION';
  }

  private summaryForLevel(
    level: string,
    score: number,
    maxScore: number,
  ): string {
    const base = `Score ${score}/${maxScore}.`;
    if (level === 'GOOD') {
      return `${base} Your routine looks generally healthy — keep it up.`;
    }
    if (level === 'FAIR') {
      return `${base} Some habits could improve. Small daily changes help.`;
    }
    return `${base} Several areas need attention. Consider focusing on sleep, movement, and stress first.`;
  }

  private tipsFromAnswers(
    answers: Array<{ questionId: string; value: string; points: number }>,
  ): string[] {
    const tips: string[] = [];
    const map = new Map(answers.map((a) => [a.questionId, a]));

    const sleep = map.get('sleep');
    if (sleep && sleep.points <= 1) {
      tips.push('Aim for a more regular sleep schedule (about 7–8 hours).');
    }
    const water = map.get('water');
    if (water && water.points <= 1) {
      tips.push('Try increasing daily water intake gradually.');
    }
    const activity = map.get('activity');
    if (activity && activity.points <= 1) {
      tips.push('Add short walks or light activity most days of the week.');
    }
    const meals = map.get('meals');
    if (meals && meals.points <= 1) {
      tips.push('Prefer regular, balanced meals over skipped or fast-food days.');
    }
    const stress = map.get('stress');
    if (stress && stress.points <= 1) {
      tips.push('Build short breaks or relaxation into your day to reduce stress.');
    }
    const meds = map.get('meds_routine');
    if (meds && meds.value !== 'not_applicable' && meds.points <= 1) {
      tips.push(
        'Use ORBIT reminders to take medicines/supplements on time if prescribed.',
      );
    }

    if (!tips.length) {
      tips.push('Maintain your current healthy routines and recheck weekly.');
    }
    return tips.slice(0, 6);
  }

  private toPublic(row: {
    id: string;
    version: string;
    answers: unknown;
    score: number;
    maxScore: number;
    level: string;
    tips: string[];
    summary: string | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      version: row.version,
      answers: row.answers,
      score: row.score,
      maxScore: row.maxScore,
      level: row.level,
      tips: row.tips,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async ensureActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    if (!user?.isActive) {
      throw new NotFoundException('User not found or inactive');
    }
  }
}
