import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationType } from '@prisma/client';

/** Swagger-only response models for POST /api/chat */
export class ChatAttachmentDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: ['IMAGE', 'DOCUMENT'] })
  kind: string;

  @ApiProperty()
  originalName: string;

  @ApiProperty()
  mimeType: string;

  @ApiPropertyOptional()
  publicUrl?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'READY', 'FAILED', 'SKIPPED'] })
  extractStatus?: string;
}

export class ChatMessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  conversationId: string;

  @ApiProperty({ enum: ['USER', 'ASSISTANT', 'SYSTEM', 'TOOL'] })
  role: string;

  @ApiProperty({ example: 'Remind me metformin daily at 8 AM' })
  content: string;

  @ApiPropertyOptional({ type: [ChatAttachmentDto] })
  attachments?: ChatAttachmentDto[];

  @ApiPropertyOptional()
  metadata?: Record<string, unknown>;

  @ApiProperty()
  createdAt: string;
}

export class ChatActionDto {
  @ApiProperty({
    example: 'REMINDER_CREATED',
    description:
      'e.g. MEDICAL_PROFILE_UPDATED | REMINDER_CREATED | DOSE_LOGGED | SYMPTOM_LOGGED',
  })
  type: string;

  @ApiPropertyOptional()
  data?: Record<string, unknown>;
}

export class ChatResponseDto {
  @ApiProperty({
    example: 'cmty7n28a0001kz2gti3tzhaz',
    description: 'Save this id and send it on the next message to continue',
  })
  conversationId: string;

  @ApiProperty({
    example: true,
    description: 'true when conversationId was omitted and a new chat was created',
  })
  isNewConversation: boolean;

  @ApiProperty({ type: ChatMessageDto })
  userMessage: ChatMessageDto;

  @ApiProperty({ type: ChatMessageDto })
  assistantMessage: ChatMessageDto;

  @ApiProperty({ type: [ChatActionDto] })
  actions: ChatActionDto[];
}

export class ChatJsonBodyDto {
  @ApiPropertyOptional({
    description: 'Omit to start a new chat; send to continue an existing one',
    example: 'cmty7n28a0001kz2gti3tzhaz',
  })
  conversationId?: string;

  @ApiPropertyOptional({
    example: 'Remind me metformin daily at 8 AM',
    description: 'Required if no files are attached',
  })
  content?: string;

  @ApiPropertyOptional({
    example: 'Health chat',
    description: 'Only used when starting a new conversation',
  })
  title?: string;

  @ApiPropertyOptional({
    enum: ConversationType,
    example: ConversationType.MEDICAL,
    description: 'Legacy — prefer omit. AI routes by message content.',
  })
  type?: ConversationType;

  @ApiPropertyOptional({
    example: 'cmfolder…',
    description: 'Optional folder for a new chat (e.g. Travel)',
  })
  folderId?: string;
}
