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
import { ApiCode, ApiSuccess } from '../common/response';
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
  @ApiSuccess({
    code: ApiCode.CHAT_SUCCESS,
    message: 'Chat response ready',
  })
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    description:
      '**Chat-first single endpoint.** One conversation; Main agent routes to domain sub-agents.\n\n' +
      '- Omit `conversationId` → creates a new chat, sends the message, returns reply\n' +
      '- Send `conversationId` → continues that chat\n' +
      '- Main router → **Health** | **Travel** | **Finance** | **Productivity** (tasks/calendar/daily plan)\n' +
      '- `images` / `documents` are **optional** (multipart only)\n' +
      '- **Any file type** accepted (jpg/png/pdf/docx/…); MIME is not blocked\n\n' +
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
            title: { type: 'string', example: 'Istanbul trip' },
            folderId: {
              type: 'string',
              description: 'Optional. Put new chat into a folder.',
              example: 'cmfolder…',
            },
            images: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description:
                'Optional. Up to 5 files via field `images` (any type, ≤8MB each). Prefer photos here.',
            },
            documents: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
              description:
                'Optional. Up to 5 files via field `documents` (any type, ≤15MB each). Prefer PDF/DOC/TXT here.',
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
\`multipart/form-data\` fields: \`content\`, \`conversationId\`, \`title\`, \`folderId\`, \`images\`, \`documents\`.
Any file type accepted. Size: images ≤8MB, documents ≤15MB. Max 5 per field.

### Domains (examples)
- Health: \`"Remind me metformin daily at 8 AM"\`
- Travel: \`"Find hotels in Istanbul Oct 10-14"\`
- Finance: \`"I spent 120 AED on groceries"\`
- Productivity: \`"Organize my day"\` / \`"Meeting with Ali tomorrow at 10am"\`

### Response
Always returns \`conversationId\`, \`isNewConversation\`, \`userMessage\`, \`assistantMessage\`, \`actions[]\`.
Assistant \`metadata\` may include \`agent\` and \`routedTo\`.
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
