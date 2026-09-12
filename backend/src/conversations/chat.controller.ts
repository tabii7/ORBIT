import {
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { ChatDto } from './dto/conversation.dto';
import {
  ChatJsonBodyDto,
  ChatResponseDto,
} from './dto/chat-swagger.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Chat')
@ApiBearerAuth('JWT')
@ApiExtraModels(ChatJsonBodyDto, ChatResponseDto)
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @HttpCode(201)
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    description:
      '**Chat-first single endpoint.**\n\n' +
      '- Omit `conversationId` → creates a new MEDICAL chat, sends the message, returns reply\n' +
      '- Send `conversationId` → continues that chat\n' +
      '- `images` / `documents` are **optional** (multipart only)\n\n' +
      'For text-only use `application/json`. For files use `multipart/form-data`.',
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ChatJsonBodyDto) },
        {
          type: 'object',
          properties: {
            conversationId: {
              type: 'string',
              description: 'Optional. Continue an existing conversation.',
              example: 'cmty7n28a0001kz2gti3tzhaz',
            },
            content: {
              type: 'string',
              example: 'Please read this report',
            },
            title: { type: 'string', example: 'Health chat' },
            type: { type: 'string', enum: ['GENERAL', 'MEDICAL'] },
            images: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description: 'Optional. Up to 5 images.',
            },
            documents: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description: 'Optional. Up to 5 PDF/TXT documents.',
            },
          },
        },
      ],
    },
  })
  @ApiOperation({
    summary: 'Chat (create or continue in one call)',
    description: `
### How to use
1. **Authorize** with JWT (login/register/social).
2. **Start chat** — POST without \`conversationId\`:
\`\`\`json
{ "content": "Remind me metformin daily at 8 AM" }
\`\`\`
3. Save \`conversationId\` from the response.
4. **Continue chat** — POST with that id:
\`\`\`json
{ "conversationId": "<id>", "content": "What allergies do I have?" }
\`\`\`

### Attachments (optional)
Multipart fields: \`content\`, \`conversationId\`, \`images\`, \`documents\`.

### Response
Always returns \`conversationId\`, \`isNewConversation\`, \`userMessage\`, \`assistantMessage\`, \`actions[]\`.
`,
  })
  @ApiCreatedResponse({
    description: 'Assistant reply (new or continued conversation)',
    type: ChatResponseDto,
  })
  @ApiOkResponse({
    description: 'Same payload shape as 201',
    type: ChatResponseDto,
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
  chat(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChatDto,
    @UploadedFiles()
    files?: { images?: Express.Multer.File[]; documents?: Express.Multer.File[] },
  ) {
    return this.conversationsService.chat(user.id, dto, files);
  }
}
