import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { ApiCode, ApiSuccess } from '../common/response';
import { ChatFoldersService } from './chat-folders.service';
import {
  CreateChatFolderDto,
  UpdateChatFolderDto,
} from './dto/chat-folder.dto';

type AuthUser = { id: string; email: string; fullName: string; role: Role };

@ApiTags('Chat Folders')
@ApiBearerAuth('JWT')
@Controller('chat-folders')
@UseGuards(JwtAuthGuard)
export class ChatFoldersController {
  constructor(private readonly chatFoldersService: ChatFoldersService) {}

  @Get()
  @ApiSuccess({
    code: ApiCode.CHAT_FOLDER_LIST,
    message: 'Chat folders fetched successfully',
  })
  @ApiOperation({
    summary: 'List my chat folders',
    description:
      'ChatGPT-style folders. Each folder can hold many conversations.',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.chatFoldersService.list(user.id);
  }

  @Post()
  @ApiSuccess({
    code: ApiCode.CHAT_FOLDER_CREATED,
    message: 'Chat folder created successfully',
  })
  @ApiOperation({ summary: 'Create a chat folder', description: 'e.g. Travel, Health' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateChatFolderDto) {
    return this.chatFoldersService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiSuccess({
    code: ApiCode.CHAT_FOLDER_UPDATED,
    message: 'Chat folder updated successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({ summary: 'Rename / reorder a chat folder' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateChatFolderDto,
  ) {
    return this.chatFoldersService.update(user.id, id, dto);
  }

  @Delete(':id')
  @ApiSuccess({
    code: ApiCode.CHAT_FOLDER_DELETED,
    message: 'Chat folder deleted successfully',
  })
  @ApiParam({ name: 'id' })
  @ApiOperation({
    summary: 'Delete a chat folder',
    description: 'Chats inside become uncategorized (folderId = null).',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chatFoldersService.remove(user.id, id);
  }
}
