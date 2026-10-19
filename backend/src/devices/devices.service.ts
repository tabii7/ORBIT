import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/device.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  register(
    userId: string,
    dto: { token?: string; fcmToken?: string; platform: DevicePlatform },
  ) {
    const token = (dto.fcmToken || dto.token || '').trim();
    if (!token || token.length < 8) {
      throw new BadRequestException('fcmToken (or token) is required');
    }
    if (!dto.platform) {
      throw new BadRequestException('platform is required');
    }

    return this.prisma.deviceToken.upsert({
      where: {
        userId_token: {
          userId,
          token,
        },
      },
      create: {
        userId,
        token,
        platform: dto.platform,
      },
      update: {
        platform: dto.platform,
      },
    });
  }

  /** Best-effort save from auth flows — ignores empty tokens. */
  async registerIfPresent(
    userId: string,
    fields?: { fcmToken?: string; platform?: DevicePlatform },
  ) {
    const token = fields?.fcmToken?.trim();
    if (!token) return null;
    const platform = fields?.platform ?? DevicePlatform.ANDROID;
    return this.register(userId, { fcmToken: token, platform });
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
    return { ok: true, deleted: true, token };
  }

  list(userId: string) {
    return this.prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
