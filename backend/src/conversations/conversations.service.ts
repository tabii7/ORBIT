import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentKind,
  ConversationType,
  ExtractStatus,
  HealthDocumentCategory,
  MessageRole,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MedicalAiService } from '../ai/medical-ai.service';
import { FileStorageService } from '../files/file-storage.service';
import { DocumentExtractService } from '../files/document-extract.service';
import {
  CreateConversationDto,
  ChatDto,
  SendMessageDto,
} from './dto/conversation.dto';
import type { ChatAttachmentInput } from '../ai/health/health-agent.service';

export type UploadedChatFiles = {
  images?: Express.Multer.File[];
  documents?: Express.Multer.File[];
};

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medicalAiService: MedicalAiService,
    private readonly fileStorage: FileStorageService,
    private readonly documentExtract: DocumentExtractService,
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

  /**
   * Chat-first entry: if conversationId is missing, create a conversation,
   * then send the message and return one combined response.
   */
  async chat(userId: string, dto: ChatDto, files?: UploadedChatFiles) {
    const images = files?.images ?? [];
    const documents = files?.documents ?? [];
    const content = (dto.content ?? '').trim();
    if (!content && images.length === 0 && documents.length === 0) {
      throw new BadRequestException(
        'Provide message content and/or attach images/documents',
      );
    }

    let conversationId = dto.conversationId?.trim() || undefined;
    let isNewConversation = false;

    if (!conversationId) {
      const created = await this.create(userId, {
        title: dto.title,
        type: dto.type,
      });
      conversationId = created.id;
      isNewConversation = true;
    }

    const result = await this.sendMessage(
      userId,
      conversationId,
      { content: dto.content },
      files,
    );

    return {
      ...result,
      conversationId,
      isNewConversation,
    };
  }

  list(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { attachments: true },
        },
      },
    });
  }

  async remove(userId: string, conversationId: string) {
    await this.getOwnedConversation(userId, conversationId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { ok: true, id: conversationId };
  }

  async getMessages(userId: string, conversationId: string) {
    await this.getOwnedConversation(userId, conversationId);
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: { attachments: true },
    });
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
    files?: UploadedChatFiles,
  ) {
    const conversation = await this.getOwnedConversation(
      userId,
      conversationId,
    );

    const images = files?.images ?? [];
    const documents = files?.documents ?? [];
    const content = (dto.content ?? '').trim();

    if (!content && images.length === 0 && documents.length === 0) {
      throw new BadRequestException(
        'Provide message content and/or attach images/documents',
      );
    }

    const displayContent =
      content ||
      (documents.length
        ? `[Attached ${documents.length} document(s)]`
        : `[Attached ${images.length} image(s)]`);

    const userMessage = await this.prisma.message.create({
      data: {
        conversationId,
        role: MessageRole.USER,
        content: displayContent,
      },
    });

    const attachmentInputs: ChatAttachmentInput[] = [];
    const savedAttachments = [];

    for (const file of images) {
      this.assertAllowedImage(file);
      const saved = await this.fileStorage.saveBuffer({
        userId,
        originalName: file.originalname,
        buffer: file.buffer,
        subdir: 'chat/images',
      });
      const row = await this.prisma.messageAttachment.create({
        data: {
          messageId: userMessage.id,
          kind: AttachmentKind.IMAGE,
          originalName: file.originalname,
          mimeType: file.mimetype,
          byteSize: file.size,
          storagePath: saved.storagePath,
          publicUrl: saved.publicUrl,
          extractStatus: ExtractStatus.SKIPPED,
        },
      });
      savedAttachments.push(row);
      attachmentInputs.push({
        kind: 'IMAGE',
        mimeType: file.mimetype,
        originalName: file.originalname,
        base64: file.buffer.toString('base64'),
        publicUrl: saved.publicUrl,
      });
    }

    for (const file of documents) {
      this.assertAllowedDocument(file);
      const saved = await this.fileStorage.saveBuffer({
        userId,
        originalName: file.originalname,
        buffer: file.buffer,
        subdir: 'chat/documents',
      });

      const extracted = await this.documentExtract.extractText({
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
      });

      const healthDoc = await this.prisma.healthDocument.create({
        data: {
          userId,
          title: file.originalname,
          category: HealthDocumentCategory.OTHER,
          fileUrl: saved.publicUrl,
          storagePath: saved.storagePath,
          mimeType: file.mimetype,
          byteSize: file.size,
          extractStatus: extracted.status as ExtractStatus,
          extractedText: extracted.text,
          notes: 'Uploaded via chat',
        },
      });

      const row = await this.prisma.messageAttachment.create({
        data: {
          messageId: userMessage.id,
          kind: AttachmentKind.DOCUMENT,
          originalName: file.originalname,
          mimeType: file.mimetype,
          byteSize: file.size,
          storagePath: saved.storagePath,
          publicUrl: saved.publicUrl,
          extractStatus: extracted.status as ExtractStatus,
          extractedText: extracted.text,
          extractError: extracted.error,
          healthDocumentId: healthDoc.id,
        },
      });
      savedAttachments.push(row);
      attachmentInputs.push({
        kind: 'DOCUMENT',
        mimeType: file.mimetype,
        originalName: file.originalname,
        extractedText: extracted.text,
        extractStatus: extracted.status,
        publicUrl: saved.publicUrl,
        healthDocumentId: healthDoc.id,
      });
    }

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
        userMessage: content || displayContent,
        history: historyForAi,
        conversationType: conversation.type,
        attachments: attachmentInputs,
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
        userMessage: { ...userMessage, attachments: savedAttachments },
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
          attachmentCount: savedAttachments.length,
        } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        title:
          conversation.title === 'Health chat'
            ? this.makeTitle(displayContent)
            : conversation.title,
      },
    });

    return {
      conversationId,
      userMessage: { ...userMessage, attachments: savedAttachments },
      assistantMessage,
      actions: aiResult.actions,
    };
  }

  private assertAllowedImage(file: Express.Multer.File) {
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException(
        `File ${file.originalname} is not an image`,
      );
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new BadRequestException('Image must be <= 8MB');
    }
  }

  private assertAllowedDocument(file: Express.Multer.File) {
    const allowed = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const ok =
      allowed.includes(file.mimetype) ||
      /\.(pdf|txt|md|csv|doc|docx)$/i.test(file.originalname);
    if (!ok) {
      throw new BadRequestException(
        `Unsupported document type: ${file.mimetype || file.originalname}`,
      );
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new BadRequestException('Document must be <= 15MB');
    }
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
