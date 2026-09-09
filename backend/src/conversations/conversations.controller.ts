import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
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

  @Get(':id/messages')
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiOperation({ summary: 'Get conversation messages' })
  getMessages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversationsService.getMessages(user.id, id);
  }

  @Post(':id/messages')
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiOperation({
    summary: 'Send a chat message',
    description:
      'AI extracts medical details from chat and auto-saves to DB (profile + medicine/appointment reminders).',
  })
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversationsService.sendMessage(user.id, id, dto);
  }
}
