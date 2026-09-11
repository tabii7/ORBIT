import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  register(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.deviceToken.upsert({
      where: {
        userId_token: {
          userId,
          token: dto.token,
        },
      },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
      },
      update: {
        platform: dto.platform,
      },
    });
  }

  async unregister(userId: string, token: string) {
    const existing = await this.prisma.deviceToken.findUnique({
      where: { userId_token: { userId, token } },
    });
    if (!existing) {
      throw new NotFoundException('Device token not found');
    }
    await this.prisma.deviceToken.delete({
      where: { id: existing.id },
    });
    return { ok: true };
  }

  list(userId: string) {
    return this.prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
