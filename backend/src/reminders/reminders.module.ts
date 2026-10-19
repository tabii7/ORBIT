import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { SchedulesController } from './schedules.controller';
import { RemindersService } from './reminders.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [RemindersController, SchedulesController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
