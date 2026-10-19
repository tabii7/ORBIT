import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { FinanceController } from './finance.controller';
import { BudgetService } from './budget.service';
import { WatchlistService } from './watchlist.service';
import { FinanceAlertService } from './finance-alert.service';
import { FinanceSearchService } from './finance-search.service';
import { FinanceAlertsCron } from './finance-alerts.cron';

@Module({
  imports: [NotificationsModule],
  controllers: [FinanceController],
  providers: [
    BudgetService,
    WatchlistService,
    FinanceAlertService,
    FinanceSearchService,
    FinanceAlertsCron,
  ],
  exports: [
    BudgetService,
    WatchlistService,
    FinanceAlertService,
    FinanceSearchService,
  ],
})
export class FinanceModule {}
