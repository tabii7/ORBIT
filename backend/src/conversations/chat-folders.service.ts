import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateChatFolderDto,
  UpdateChatFolderDto,
} from './dto/chat-folder.dto';

@Injectable()
export class ChatFoldersService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.chatFolder.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        _count: { select: { conversations: true } },
      },
    });
  }

  async get(userId: string, id: string) {
    const folder = await this.prisma.chatFolder.findFirst({
      where: { id, userId },
      include: {
        _count: { select: { conversations: true } },
      },
    });
    if (!folder) throw new NotFoundException('Chat folder not found');
    return folder;
  }

  async create(userId: string, dto: CreateChatFolderDto) {
    const name = dto.name.trim();
    try {
      return await this.prisma.chatFolder.create({
        data: {
          userId,
          name,
          sortOrder: dto.sortOrder ?? 0,
        },
        include: {
          _count: { select: { conversations: true } },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Folder "${name}" already exists`);
      }
      throw error;
    }
  }

  async update(userId: string, id: string, dto: UpdateChatFolderDto) {
    await this.get(userId, id);
    try {
      return await this.prisma.chatFolder.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
        include: {
          _count: { select: { conversations: true } },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A folder with that name already exists');
      }
      throw error;
    }
  }

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    // Conversations keep existing; folderId set null via onDelete: SetNull
    await this.prisma.chatFolder.delete({ where: { id } });
    return { ok: true, deleted: true, id };
  }

  async assertOwned(userId: string, folderId: string) {
    await this.get(userId, folderId);
  }
}
