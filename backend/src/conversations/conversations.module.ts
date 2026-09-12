import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ChatController } from './chat.controller';
import { ConversationsService } from './conversations.service';
import { AiModule } from '../ai/ai.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [AiModule, FilesModule],
  controllers: [ChatController, ConversationsController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
