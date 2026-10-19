import { Injectable, NotFoundException } from '@nestjs/common';
import { BusinessNoteKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBusinessNoteDto,
  UpdateBusinessNoteDto,
} from './dto/business.dto';

@Injectable()
export class BusinessNotesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, kind?: BusinessNoteKind) {
    return this.prisma.businessNote.findMany({
      where: {
        userId,
        ...(kind ? { kind } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const note = await this.prisma.businessNote.findFirst({
      where: { id, userId },
    });
    if (!note) throw new NotFoundException('Business note not found');
    return note;
  }

  create(userId: string, dto: CreateBusinessNoteDto) {
    return this.prisma.businessNote.create({
      data: {
        userId,
        title: dto.title.trim(),
        body: dto.body,
        kind: dto.kind ?? BusinessNoteKind.NOTE,
        checklistItems: dto.checklistItems
          ? (dto.checklistItems as unknown as Prisma.InputJsonValue)
          : undefined,
        tags: dto.tags ?? [],
        sourceUrls: dto.sourceUrls ?? [],
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateBusinessNoteDto) {
    await this.get(userId, id);
    return this.prisma.businessNote.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.checklistItems !== undefined
          ? {
              checklistItems:
                dto.checklistItems as unknown as Prisma.InputJsonValue,
            }
          : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        ...(dto.sourceUrls !== undefined ? { sourceUrls: dto.sourceUrls } : {}),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.prisma.businessNote.delete({ where: { id } });
    return { ok: true, deleted: true, id };
  }
}
