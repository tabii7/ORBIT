import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFinanceAlertDto,
  UpdateFinanceAlertDto,
} from './dto/finance.dto';

@Injectable()
export class FinanceAlertService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.financeAlert.findMany({
      where: { userId },
      include: { watchlistItem: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listActive() {
    return this.prisma.financeAlert.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: 'asc' },
      take: 200,
    });
  }

  create(userId: string, dto: CreateFinanceAlertDto) {
    return this.prisma.financeAlert.create({
      data: {
        userId,
        symbol: dto.symbol.trim().toUpperCase(),
        condition: dto.condition,
        threshold: dto.threshold,
        currency: dto.currency ?? 'AED',
        watchlistItemId: dto.watchlistItemId,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateFinanceAlertDto) {
    await this.getOwned(userId, id);
    return this.prisma.financeAlert.update({
      where: { id },
      data: {
        ...(dto.condition !== undefined ? { condition: dto.condition } : {}),
        ...(dto.threshold !== undefined ? { threshold: dto.threshold } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.getOwned(userId, id);
    await this.prisma.financeAlert.delete({ where: { id } });
    return { ok: true, deleted: true, id };
  }

  markTriggered(id: string, price: number) {
    return this.prisma.financeAlert.update({
      where: { id },
      data: {
        lastTriggeredAt: new Date(),
        lastPrice: price,
      },
    });
  }

  private async getOwned(userId: string, id: string) {
    const alert = await this.prisma.financeAlert.findFirst({
      where: { id, userId },
    });
    if (!alert) throw new NotFoundException('Finance alert not found');
    return alert;
  }
}
