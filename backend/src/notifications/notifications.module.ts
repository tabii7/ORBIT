import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { DailySummaryService } from './daily-summary.service';
import { DailySummaryCron } from './daily-summary.cron';
import { DailySummaryController } from './daily-summary.controller';

@Module({
  controllers: [DailySummaryController],
  providers: [NotificationsService, DailySummaryService, DailySummaryCron],
  exports: [NotificationsService, DailySummaryService],
})
export class NotificationsModule {}
