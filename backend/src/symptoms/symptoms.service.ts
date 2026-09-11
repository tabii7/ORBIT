import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSymptomDto } from './dto/symptom.dto';

@Injectable()
export class SymptomsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateSymptomDto) {
    return this.prisma.symptomEntry.create({
      data: {
        userId,
        symptoms: dto.symptoms,
        severity: dto.severity,
        notes: dto.notes,
        relatedMedications: dto.relatedMedications ?? [],
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
      },
    });
  }

  list(userId: string, filters?: { from?: string; to?: string }) {
    return this.prisma.symptomEntry.findMany({
      where: {
        userId,
        ...(filters?.from || filters?.to
          ? {
              recordedAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async remove(userId: string, id: string) {
    const entry = await this.prisma.symptomEntry.findFirst({
      where: { id, userId },
    });
    if (!entry) {
      throw new NotFoundException('Symptom entry not found');
    }
    await this.prisma.symptomEntry.delete({ where: { id } });
    return { ok: true, id };
  }
}
