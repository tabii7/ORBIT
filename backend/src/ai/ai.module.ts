import { Module } from '@nestjs/common';
import { MedicalAiService } from './medical-ai.service';
import { HealthAgentService } from './health/health-agent.service';
import { RemindersModule } from '../reminders/reminders.module';
import { SymptomsModule } from '../symptoms/symptoms.module';
import { HealthDocumentsModule } from '../health-documents/health-documents.module';

@Module({
  imports: [RemindersModule, SymptomsModule, HealthDocumentsModule],
  providers: [HealthAgentService, MedicalAiService],
  exports: [HealthAgentService, MedicalAiService],
})
export class AiModule {}
