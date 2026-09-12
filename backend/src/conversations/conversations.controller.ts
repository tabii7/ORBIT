import {
  Controller,
  Delete,
  Get,
  Param,
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

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Conversations')
@ApiBearerAuth('JWT')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

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
    summary: 'Get conversation message history (for scrollable chat UI)',
  })
  getMessages(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversationsService.getMessages(user.id, id);
  }
}
