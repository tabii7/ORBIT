import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Price-alert polling remains CLOSED.
 * Live market data is only fetched when the user asks in POST /api/chat.
 * Alerts can be stored via REST/chat; they will not auto-fire.
 */
@Injectable()
export class FinanceAlertsCron implements OnModuleInit {
  private readonly logger = new Logger(FinanceAlertsCron.name);

  onModuleInit() {
    this.logger.log(
      'Finance alert cron CLOSED — live market web search is chat-only.',
    );
  }
}
