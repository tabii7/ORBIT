import { Module } from '@nestjs/common';
import { RemindersModule } from '../reminders/reminders.module';
import { ProductivityController } from './productivity.controller';
import { TasksService } from './tasks.service';
import { CalendarService } from './calendar.service';
import { DailyPlanService } from './daily-plan.service';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  imports: [RemindersModule],
  controllers: [ProductivityController],
  providers: [
    TasksService,
    CalendarService,
    DailyPlanService,
    GoogleCalendarService,
  ],
  exports: [
    TasksService,
    CalendarService,
    DailyPlanService,
    GoogleCalendarService,
  ],
})
export class ProductivityModule {}
