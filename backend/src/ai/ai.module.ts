import { Module } from '@nestjs/common';
import { MedicalAiService } from './medical-ai.service';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [RemindersModule],
  providers: [MedicalAiService],
  exports: [MedicalAiService],
})
export class AiModule {}
