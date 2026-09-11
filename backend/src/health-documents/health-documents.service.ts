import { Injectable, NotFoundException } from '@nestjs/common';
import { HealthDocumentCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHealthDocumentDto } from './dto/health-document.dto';

@Injectable()
export class HealthDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateHealthDocumentDto) {
    return this.prisma.healthDocument.create({
      data: {
        userId,
        title: dto.title,
        category: dto.category ?? HealthDocumentCategory.OTHER,
        fileUrl: dto.fileUrl,
        notes: dto.notes,
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
      },
    });
  }

  list(userId: string) {
    return this.prisma.healthDocument.findMany({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async remove(userId: string, id: string) {
    const doc = await this.prisma.healthDocument.findFirst({
      where: { id, userId },
    });
    if (!doc) {
      throw new NotFoundException('Health document not found');
    }
    await this.prisma.healthDocument.delete({ where: { id } });
    return { ok: true, id };
  }
}
