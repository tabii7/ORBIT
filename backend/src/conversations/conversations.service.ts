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
import { runWithChatOpenAi } from '../ai/openai-chat-scope';
import { FileStorageService } from '../files/file-storage.service';
import { DocumentExtractService } from '../files/document-extract.service';
import {
  CreateConversationDto,
  ChatDto,
  SendMessageDto,
} from './dto/conversation.dto';
import { UpdateConversationDto } from './dto/chat-folder.dto';
import { ChatFoldersService } from './chat-folders.service';
import type { ChatAttachmentInput } from '../ai/agent.types';

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
    private readonly chatFoldersService: ChatFoldersService,
  ) {}

  async create(userId: string, dto: CreateConversationDto) {
    const folderId = dto.folderId?.trim() || undefined;
    if (folderId) {
      await this.chatFoldersService.assertOwned(userId, folderId);
    }
    return this.prisma.conversation.create({
      data: {
        userId,
        title: dto.title ?? 'New chat',
        type: dto.type ?? ConversationType.MEDICAL,
        folderId,
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
        folderId: dto.folderId,
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

  list(
    userId: string,
    opts?: { folderId?: string; uncategorized?: boolean },
  ) {
    return this.prisma.conversation.findMany({
      where: {
        userId,
        ...(opts?.uncategorized
          ? { folderId: null }
          : opts?.folderId
            ? { folderId: opts.folderId }
            : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        folder: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { attachments: true },
        },
      },
    });
  }

  async updateConversation(
    userId: string,
    conversationId: string,
    dto: UpdateConversationDto,
  ) {
    await this.getOwnedConversation(userId, conversationId);

    if (dto.folderId !== undefined && dto.folderId !== null) {
      await this.chatFoldersService.assertOwned(userId, dto.folderId);
    }

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.folderId !== undefined ? { folderId: dto.folderId } : {}),
      },
      include: {
        folder: { select: { id: true, name: true } },
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
      const mimeType = this.resolveMime(file);
      const saved = await this.fileStorage.saveBuffer({
        userId,
        originalName: file.originalname,
        buffer: file.buffer,
        subdir: 'chat/images',
      });

      const extracted = await runWithChatOpenAi(() =>
        this.documentExtract.extractText({
          buffer: file.buffer,
          mimeType,
          originalName: file.originalname,
        }),
      );

      const healthDoc = await this.prisma.healthDocument.create({
        data: {
          userId,
          title: file.originalname,
          category: HealthDocumentCategory.OTHER,
          fileUrl: saved.publicUrl,
          storagePath: saved.storagePath,
          mimeType,
          byteSize: file.size,
          extractStatus: extracted.status as ExtractStatus,
          extractedText: extracted.text,
          notes: 'Uploaded via chat (image)',
        },
      });

      const row = await this.prisma.messageAttachment.create({
        data: {
          messageId: userMessage.id,
          kind: AttachmentKind.IMAGE,
          originalName: file.originalname,
          mimeType,
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
        kind: 'IMAGE',
        mimeType,
        originalName: file.originalname,
        base64: file.buffer.toString('base64'),
        extractedText: extracted.text,
        extractStatus: extracted.status,
        publicUrl: saved.publicUrl,
        healthDocumentId: healthDoc.id,
      });
    }

    for (const file of documents) {
      this.assertAllowedDocument(file);
      const mimeType = this.resolveMime(file);
      const saved = await this.fileStorage.saveBuffer({
        userId,
        originalName: file.originalname,
        buffer: file.buffer,
        subdir: 'chat/documents',
      });

      const extracted = await runWithChatOpenAi(() =>
        this.documentExtract.extractText({
          buffer: file.buffer,
          mimeType,
          originalName: file.originalname,
        }),
      );

      const healthDoc = await this.prisma.healthDocument.create({
        data: {
          userId,
          title: file.originalname,
          category: HealthDocumentCategory.OTHER,
          fileUrl: saved.publicUrl,
          storagePath: saved.storagePath,
          mimeType,
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
          mimeType,
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
        mimeType,
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
      agent?: string;
      routedTo?: string[];
    };

    try {
      aiResult = await runWithChatOpenAi(() =>
        this.medicalAiService.chat({
          userId,
          userMessage: content || displayContent,
          history: historyForAi,
          conversationType: conversation.type,
          attachments: attachmentInputs,
        }),
      );
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
          agent: aiResult.agent ?? 'MAIN',
          routedTo: aiResult.routedTo ?? [],
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

  /** Any file type accepted; size only. */
  private assertAllowedImage(file: Express.Multer.File) {
    if (file.size > 8 * 1024 * 1024) {
      throw new BadRequestException('Image must be <= 8MB');
    }
  }

  /** Any file type accepted; size only. */
  private assertAllowedDocument(file: Express.Multer.File) {
    if (file.size > 15 * 1024 * 1024) {
      throw new BadRequestException('Document must be <= 15MB');
    }
  }

  /** Prefer client MIME; if missing/octet-stream, guess from filename. */
  private resolveMime(file: Express.Multer.File): string {
    const mime = (file.mimetype || '').toLowerCase().trim();
    if (mime && mime !== 'application/octet-stream') return mime;
    const name = (file.originalname || '').toLowerCase();
    if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.gif')) return 'image/gif';
    if (name.endsWith('.webp')) return 'image/webp';
    if (name.endsWith('.heic')) return 'image/heic';
    if (name.endsWith('.heif')) return 'image/heif';
    if (name.endsWith('.bmp')) return 'image/bmp';
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.txt')) return 'text/plain';
    if (name.endsWith('.md')) return 'text/markdown';
    if (name.endsWith('.csv')) return 'text/csv';
    if (name.endsWith('.doc')) return 'application/msword';
    if (name.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    return mime || 'application/octet-stream';
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
