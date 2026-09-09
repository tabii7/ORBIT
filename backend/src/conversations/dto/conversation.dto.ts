import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
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
  @ApiProperty({
    example: 'I take medicine X at 8 AM and 8 PM every day. Remind me.',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  content: string;
}
