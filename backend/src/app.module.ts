import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfileModule } from './profile/profile.module';
import { RemindersModule } from './reminders/reminders.module';
import { AiModule } from './ai/ai.module';
import { ConversationsModule } from './conversations/conversations.module';
import { SymptomsModule } from './symptoms/symptoms.module';
import { HealthDocumentsModule } from './health-documents/health-documents.module';
import { DevicesModule } from './devices/devices.module';
import { TravelModule } from './travel/travel.module';
import { FinanceModule } from './finance/finance.module';
import { ProductivityModule } from './productivity/productivity.module';
import { BusinessModule } from './business/business.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SupportModule } from './support/support.module';
import { HealthCheckModule } from './health-check/health-check.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProfileModule,
    RemindersModule,
    SymptomsModule,
    HealthDocumentsModule,
    HealthCheckModule,
    DevicesModule,
    TravelModule,
    FinanceModule,
    ProductivityModule,
    BusinessModule,
    NotificationsModule,
    SupportModule,
    AiModule,
    ConversationsModule,
  ],
})
export class AppModule {}
