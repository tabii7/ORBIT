import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationType, MessageRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MedicalAiService } from '../ai/medical-ai.service';
import {
  CreateConversationDto,
  SendMessageDto,
} from './dto/conversation.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medicalAiService: MedicalAiService,
  ) {}

  create(userId: string, dto: CreateConversationDto) {
    return this.prisma.conversation.create({
      data: {
        userId,
        title: dto.title ?? 'Health chat',
        type: dto.type ?? ConversationType.MEDICAL,
      },
    });
  }

  list(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async getMessages(userId: string, conversationId: string) {
    await this.getOwnedConversation(userId, conversationId);
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    const conversation = await this.getOwnedConversation(
      userId,
      conversationId,
    );

    const userMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: MessageRole.USER,
        content: dto.content,
      },
    });

    const history = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const historyForAi = history
      .filter((m) => m.id !== userMessage.id)
      .map((m) => ({
        role: m.role as 'USER' | 'ASSISTANT' | 'SYSTEM',
        content: m.content,
      }));

    let aiResult: {
      message: string;
      actions: Array<Record<string, unknown>>;
      model: string;
    };

    try {
      aiResult = await this.medicalAiService.chat({
        userId,
        userMessage: dto.content,
        history: historyForAi,
      });
    } catch (error) {
      const errMessage =
        error instanceof Error ? error.message : 'AI request failed';
      const assistantMessage = await this.prisma.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content:
            'Sorry — I could not process that right now. Please try again.',
          metadata: { error: errMessage },
        },
      });

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return {
        conversationId,
        userMessage,
        assistantMessage,
        actions: [],
        error: errMessage,
      };
    }

    const assistantMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: MessageRole.ASSISTANT,
        content: aiResult.message,
        metadata: {
          actions: aiResult.actions,
          model: aiResult.model,
          conversationType: conversation.type,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        title:
          conversation.title === 'Health chat'
            ? this.makeTitle(dto.content)
            : conversation.title,
      },
    });

    return {
      conversationId,
      userMessage,
      assistantMessage,
      actions: aiResult.actions,
    };
  }

  private async getOwnedConversation(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }
    return conversation;
  }

  private makeTitle(content: string) {
    const cleaned = content.trim().replace(/\s+/g, ' ');
    return cleaned.length > 48 ? `${cleaned.slice(0, 45)}...` : cleaned;
  }
}
