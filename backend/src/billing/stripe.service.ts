import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean((this.config.get<string>('STRIPE_SECRET_KEY') || '').trim());
  }

  getStripe(): Stripe {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY in backend .env',
      );
    }
    if (!this.client) {
      this.client = new Stripe(
        (this.config.get<string>('STRIPE_SECRET_KEY') || '').trim(),
      );
    }
    return this.client;
  }

  constructEvent(rawBody: Buffer, signature: string) {
    const secret = (this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '').trim();
    if (!secret) {
      throw new ServiceUnavailableException(
        'STRIPE_WEBHOOK_SECRET is not configured',
      );
    }
    return this.getStripe().webhooks.constructEvent(rawBody, signature, secret);
  }

  successUrl() {
    return (
      this.config.get<string>('STRIPE_SUCCESS_URL') ||
      'https://orbit.ai/billing/success?session_id={CHECKOUT_SESSION_ID}'
    );
  }

  cancelUrl() {
    return (
      this.config.get<string>('STRIPE_CANCEL_URL') ||
      'https://orbit.ai/billing/cancel'
    );
  }
}
