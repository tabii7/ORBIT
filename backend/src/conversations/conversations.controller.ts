import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import {
  CreateConversationDto,
  SendMessageDto,
} from './dto/conversation.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Conversations')
@ApiBearerAuth('JWT')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @ApiOperation({ summary: 'Start a new conversation (medical by default)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my conversations' })
  list(@CurrentUser() user: AuthUser) {
    return this.conversationsService.list(user.id);
  }

  @Delete(':id')
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiOperation({ summary: 'Delete a conversation and its messages' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversationsService.remove(user.id, id);
  }

  @Get(':id/messages')
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiOperation({
    summary: 'Get conversation messages (includes image/document attachments)',
  })
  getMessages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversationsService.getMessages(user.id, id);
  }

  @Post(':id/messages')
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    description:
      'Send text and/or attach images + documents. Use multipart/form-data for files.',
    schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          example: 'Please read this report and summarize my next appointment.',
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
        documents: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Send a chat message (text + optional images/documents)',
    description:
      'JSON body `{ content }` for text-only. Multipart form fields: `content`, `images` (files), `documents` (PDF/TXT). Documents are extracted and saved to health documents; images are analyzed by the vision-capable model.',
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'images', maxCount: 5 },
        { name: 'documents', maxCount: 5 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 15 * 1024 * 1024 },
      },
    ),
  )
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @UploadedFiles()
    files?: { images?: Express.Multer.File[]; documents?: Express.Multer.File[] },
  ) {
    return this.conversationsService.sendMessage(user.id, id, dto, files);
  }
}
