import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationType } from '@prisma/client';

export class CreateConversationDto {
  @ApiPropertyOptional({ example: 'Health chat' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    enum: ConversationType,
    default: ConversationType.MEDICAL,
    description: 'Legacy label only — AI routing ignores this. Prefer omit.',
  })
  @IsOptional()
  @IsEnum(ConversationType)
  type?: ConversationType;

  @ApiPropertyOptional({
    example: 'cmfolder…',
    description: 'Optional chat folder id (e.g. Travel, Health)',
  })
  @IsOptional()
  @IsString()
  folderId?: string;
}

/** @deprecated Prefer ChatDto via POST /api/chat */
export class SendMessageDto {
  @ApiPropertyOptional({
    example: 'Please read this report and remind me about the next appointment.',
  })
  @ValidateIf(
    (o: SendMessageDto) => o.content !== undefined && o.content !== '',
  )
  @IsString()
  @MinLength(1)
  @IsOptional()
  content?: string;
}

/** Single chat-first endpoint body: create if no id, else continue. */
export class ChatDto {
  @ApiPropertyOptional({
    description: 'Existing conversation id. Omit to start a new chat.',
    example: 'cmxxxx...',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiPropertyOptional({
    example: 'Remind me metformin daily at 8 AM',
    description: 'Optional if images/documents are attached.',
  })
  @ValidateIf((o: ChatDto) => o.content !== undefined && o.content !== '')
  @IsString()
  @MinLength(1)
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({
    example: 'Health chat',
    description: 'Used only when creating a new conversation',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    enum: ConversationType,
    default: ConversationType.MEDICAL,
    description:
      'Legacy label only when creating a chat — AI routes by message. Prefer omit.',
  })
  @IsOptional()
  @IsEnum(ConversationType)
  type?: ConversationType;

  @ApiPropertyOptional({
    example: 'cmfolder…',
    description:
      'Optional. Put a new chat into this folder. Ignored when continuing an existing conversation.',
  })
  @IsOptional()
  @IsString()
  folderId?: string;
}
