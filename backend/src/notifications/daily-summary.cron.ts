import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DailySummaryService } from './daily-summary.service';

@Injectable()
export class DailySummaryCron {
  private readonly logger = new Logger(DailySummaryCron.name);
  private running = false;

  constructor(
    private readonly dailySummaryService: DailySummaryService,
    private readonly config: ConfigService,
  ) {}

  /** Every minute: generate + soft-push for users whose local time is 07:00. */
  @Cron(CronExpression.EVERY_MINUTE)
  async morningDigest() {
    if (this.running) return;
    const hour = Number(this.config.get('DAILY_SUMMARY_HOUR') ?? 7);
    const minute = Number(this.config.get('DAILY_SUMMARY_MINUTE') ?? 0);

    this.running = true;
    try {
      const userIds = await this.dailySummaryService.listUsersAtLocalTime(
        hour,
        minute,
      );
      if (!userIds.length) return;

      let generated = 0;
      for (const userId of userIds) {
        try {
          const result = await this.dailySummaryService.getOrCreate(userId, {
            force: false,
            sendPush: true,
          });
          if (!result.cached) generated += 1;
        } catch (error) {
          this.logger.warn(
            `Daily summary failed user=${userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      if (generated) {
        this.logger.log(
          `Morning daily summary: users=${userIds.length} newlyGenerated=${generated}`,
        );
      }
    } finally {
      this.running = false;
    }
  }
}
