import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinanceMarket } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWatchlistItemDto } from './dto/finance.dto';

@Injectable()
export class WatchlistService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.watchlistItem.findMany({
      where: { userId },
      include: { alerts: { where: { isActive: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(userId: string, dto: CreateWatchlistItemDto) {
    const symbol = dto.symbol.trim().toUpperCase();
    try {
      return await this.prisma.watchlistItem.create({
        data: {
          userId,
          symbol,
          market: dto.market ?? this.guessMarket(symbol),
          displayName: dto.displayName,
          notes: dto.notes,
        },
      });
    } catch {
      throw new ConflictException(`Symbol ${symbol} is already on your watchlist`);
    }
  }

  async remove(userId: string, id: string) {
    const item = await this.prisma.watchlistItem.findFirst({
      where: { id, userId },
    });
    if (!item) throw new NotFoundException('Watchlist item not found');
    await this.prisma.watchlistItem.delete({ where: { id } });
    return { ok: true, deleted: true, id };
  }

  async findBySymbol(userId: string, symbol: string) {
    return this.prisma.watchlistItem.findFirst({
      where: { userId, symbol: symbol.trim().toUpperCase() },
    });
  }

  private guessMarket(symbol: string): FinanceMarket {
    if (symbol.endsWith('.AD') || symbol.includes('ADX')) {
      return FinanceMarket.ADX;
    }
    return FinanceMarket.OTHER;
  }
}
