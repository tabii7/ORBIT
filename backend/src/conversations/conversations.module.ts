import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ChatController } from './chat.controller';
import { ChatFoldersController } from './chat-folders.controller';
import { ConversationsService } from './conversations.service';
import { ChatFoldersService } from './chat-folders.service';
import { AiModule } from '../ai/ai.module';
import { FilesModule } from '../files/files.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [AiModule, FilesModule, BillingModule],
  controllers: [
    ChatController,
    ConversationsController,
    ChatFoldersController,
  ],
  providers: [ConversationsService, ChatFoldersService],
})
export class ConversationsModule {}
