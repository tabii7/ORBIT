import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationType } from '@prisma/client';

export class CreateConversationDto {
  @ApiPropertyOptional({ example: 'Health chat' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    enum: ConversationType,
    default: ConversationType.MEDICAL,
  })
  @IsOptional()
  @IsEnum(ConversationType)
  type?: ConversationType;
}

export class SendMessageDto {
  @ApiPropertyOptional({
    example: 'Please read this report and remind me about the next appointment.',
    description:
      'Optional if images/documents are attached. Required when sending JSON with no files.',
  })
  @ValidateIf((o: SendMessageDto) => o.content !== undefined && o.content !== '')
  @IsString()
  @MinLength(1)
  @IsOptional()
  content?: string;
}
