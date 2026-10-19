import { Injectable } from '@nestjs/common';
import { BudgetEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBudgetEntryDto } from './dto/finance.dto';

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateBudgetEntryDto) {
    return this.prisma.budgetEntry.create({
      data: {
        userId,
        type: dto.type,
        category: dto.category.trim(),
        amount: dto.amount,
        currency: dto.currency ?? 'AED',
        note: dto.note,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
    });
  }

  list(userId: string, take = 50) {
    return this.prisma.budgetEntry.findMany({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
      take,
    });
  }

  async remove(userId: string, id: string) {
    const entry = await this.prisma.budgetEntry.findFirst({
      where: { id, userId },
    });
    if (!entry) return { ok: false, deleted: false };
    await this.prisma.budgetEntry.delete({ where: { id } });
    return { ok: true, deleted: true, id };
  }

  async summary(userId: string, from?: Date, to?: Date) {
    const where: Prisma.BudgetEntryWhereInput = {
      userId,
      ...(from || to
        ? {
            occurredAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const entries = await this.prisma.budgetEntry.findMany({ where });
    let income = 0;
    let expense = 0;
    const byCategory: Record<string, { income: number; expense: number }> = {};

    for (const e of entries) {
      const cat = e.category || 'uncategorized';
      if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 };
      if (e.type === BudgetEntryType.INCOME) {
        income += e.amount;
        byCategory[cat].income += e.amount;
      } else {
        expense += e.amount;
        byCategory[cat].expense += e.amount;
      }
    }

    return {
      currency: entries[0]?.currency ?? 'AED',
      income,
      expense,
      net: income - expense,
      count: entries.length,
      byCategory,
    };
  }
}
