import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { CreditsService } from './credits.service';
import { StripeService } from './stripe.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, CreditsService, StripeService],
  exports: [BillingService, CreditsService, StripeService],
})
export class BillingModule {}
