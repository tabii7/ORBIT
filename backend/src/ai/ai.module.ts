import { Module } from '@nestjs/common';
import { MedicalAiService } from './medical-ai.service';
import { HealthAgentService } from './health/health-agent.service';
import { TravelAgentService } from './travel/travel-agent.service';
import { FinanceAgentService } from './finance/finance-agent.service';
import { ProductivityAgentService } from './productivity/productivity-agent.service';
import { BusinessAgentService } from './business/business-agent.service';
import { MainAgentService } from './main/main-agent.service';
import { RemindersModule } from '../reminders/reminders.module';
import { SymptomsModule } from '../symptoms/symptoms.module';
import { HealthDocumentsModule } from '../health-documents/health-documents.module';
import { TravelModule } from '../travel/travel.module';
import { FinanceModule } from '../finance/finance.module';
import { ProductivityModule } from '../productivity/productivity.module';
import { BusinessModule } from '../business/business.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProfileModule } from '../profile/profile.module';

@Module({
  imports: [
    RemindersModule,
    SymptomsModule,
    HealthDocumentsModule,
    TravelModule,
    FinanceModule,
    ProductivityModule,
    BusinessModule,
    NotificationsModule,
    ProfileModule,
  ],
  providers: [
    HealthAgentService,
    TravelAgentService,
    FinanceAgentService,
    ProductivityAgentService,
    BusinessAgentService,
    MainAgentService,
    MedicalAiService,
  ],
  exports: [
    HealthAgentService,
    TravelAgentService,
    FinanceAgentService,
    ProductivityAgentService,
    BusinessAgentService,
    MainAgentService,
    MedicalAiService,
  ],
})
export class AiModule {}
