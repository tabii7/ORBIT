import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiCode, ApiSuccess } from '../common/response';
import { ConversationsService } from './conversations.service';
import { UpdateConversationDto } from './dto/chat-folder.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Conversations')
@ApiBearerAuth('JWT')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiSuccess({
    code: ApiCode.CONVERSATION_LIST,
    message: 'Conversations fetched successfully',
  })
  @ApiOperation({
    summary: 'List my conversations',
    description:
      'Optional `folderId` = chats in that folder. `uncategorized=true` = chats with no folder.',
  })
  @ApiQuery({ name: 'folderId', required: false })
  @ApiQuery({ name: 'uncategorized', required: false, example: 'true' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('folderId') folderId?: string,
    @Query('uncategorized') uncategorized?: string,
  ) {
    return this.conversationsService.list(user.id, {
      folderId,
      uncategorized: uncategorized === 'true' || uncategorized === '1',
    });
  }

  @Patch(':id')
  @ApiSuccess({
    code: ApiCode.CONVERSATION_UPDATED,
    message: 'Conversation updated successfully',
  })
  @ApiParam({ name: 'id', description: 'Conversation id' })
  @ApiOperation({
    summary: 'Rename chat or move to a folder',
    description:
      'Set `folderId` to move into a folder; set `folderId: null` to uncategorize.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.updateConversation(user.id, id, dto);
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
