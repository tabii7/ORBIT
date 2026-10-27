import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BillingInterval, SubscriptionStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from './credits.service';
import { StripeService } from './stripe.service';
import { CreateCheckoutDto } from './dto/billing.dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly stripeService: StripeService,
    private readonly config: ConfigService,
  ) {}

  async listPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { prices: { orderBy: { interval: 'asc' } } },
    });
    return {
      plans: plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        prices: p.prices.map((pr) => ({
          id: pr.id,
          interval: pr.interval,
          amountCents: pr.amountCents,
          currency: pr.currency,
          creditsPerPeriod: pr.creditsPerPeriod,
          stripePriceId: pr.stripePriceId,
          configured: Boolean(pr.stripePriceId),
        })),
      })),
      stripeEnabled: this.stripeService.isConfigured(),
      signupBonusCredits: this.credits.signupBonusAmount(),
      chatCreditCost: this.credits.chatCost(false),
      chatCreditCostWithAttachments: this.credits.chatCost(true),
    };
  }

  async getMyBilling(userId: string) {
    await this.credits.ensureAccount(userId);
    await this.credits.grantSignupBonus(userId);
    const [balance, sub, recent] = await Promise.all([
      this.credits.getBalance(userId),
      this.prisma.userSubscription.findUnique({
        where: { userId },
        include: {
          plan: { include: { prices: true } },
        },
      }),
      this.prisma.creditLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      balance,
      subscription: sub
        ? {
            status: sub.status,
            interval: sub.interval,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
            plan: {
              code: sub.plan.code,
              name: sub.plan.name,
            },
          }
        : null,
      ledger: recent.map((e) => ({
        id: e.id,
        delta: e.delta,
        reason: e.reason,
        balanceAfter: e.balanceAfter,
        reference: e.reference,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async createCheckout(userId: string, dto: CreateCheckoutDto) {
    const stripe = this.stripeService.getStripe();
    const code = dto.planCode.trim().toLowerCase();
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { code, isActive: true },
      include: { prices: true },
    });
    if (!plan) {
      throw new NotFoundException(`Plan not found: ${code}`);
    }
    const price = plan.prices.find((p) => p.interval === dto.interval);
    if (!price?.stripePriceId) {
      throw new BadRequestException(
        `Stripe price not configured for ${code} ${dto.interval}. Set stripePriceId on PlanPrice (seed/env).`,
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, stripeCustomerId: true },
    });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.fullName,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await this.prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: price.stripePriceId, quantity: 1 }],
      success_url: dto.successUrl || this.stripeService.successUrl(),
      cancel_url: dto.cancelUrl || this.stripeService.cancelUrl(),
      client_reference_id: userId,
      metadata: {
        userId,
        planCode: plan.code,
        interval: dto.interval,
        planPriceId: price.id,
      },
      subscription_data: {
        metadata: {
          userId,
          planCode: plan.code,
          interval: dto.interval,
          planPriceId: price.id,
        },
      },
    });

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      planCode: plan.code,
      interval: dto.interval,
    };
  }

  async createPortal(userId: string) {
    const stripe = this.stripeService.getStripe();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });
    if (!user.stripeCustomerId) {
      throw new BadRequestException(
        'No Stripe customer yet. Subscribe to a plan first.',
      );
    }
    const returnUrl =
      this.config.get<string>('STRIPE_PORTAL_RETURN_URL') ||
      this.stripeService.cancelUrl();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });
    return { portalUrl: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const event = this.stripeService.constructEvent(rawBody, signature);
    this.logger.log(`Stripe webhook type=${event.type} id=${event.id}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.paid':
        await this.onInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscriptionChanged(
          event.data.object as Stripe.Subscription,
        );
        break;
      default:
        break;
    }

    return { received: true, type: event.type };
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    if (session.mode !== 'subscription') return;
    const userId =
      session.metadata?.userId || session.client_reference_id || undefined;
    if (!userId || typeof session.subscription !== 'string') {
      this.logger.warn('checkout.session.completed missing userId/subscription');
      return;
    }

    const stripe = this.stripeService.getStripe();
    const sub = await stripe.subscriptions.retrieve(session.subscription);
    await this.upsertSubscriptionFromStripe(userId, sub, {
      planPriceId: session.metadata?.planPriceId,
      planCode: session.metadata?.planCode,
      interval: session.metadata?.interval as BillingInterval | undefined,
    });
  }

  private subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
    const anyInv = invoice as Stripe.Invoice & {
      subscription?: string | { id?: string } | null;
      parent?: { subscription_details?: { subscription?: string } };
    };
    if (typeof anyInv.subscription === 'string') return anyInv.subscription;
    if (anyInv.subscription && typeof anyInv.subscription === 'object') {
      return anyInv.subscription.id || null;
    }
    return anyInv.parent?.subscription_details?.subscription || null;
  }

  private async onInvoicePaid(invoice: Stripe.Invoice) {
    const subId = this.subscriptionIdFromInvoice(invoice);
    if (!subId) return;

    const stripe = this.stripeService.getStripe();
    const sub = await stripe.subscriptions.retrieve(subId);
    const userId = sub.metadata?.userId;
    if (!userId) {
      // Resolve via customer
      const customerId =
        typeof invoice.customer === 'string'
          ? invoice.customer
          : invoice.customer?.id;
      if (!customerId) return;
      const user = await this.prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
      });
      if (!user) return;
      await this.upsertSubscriptionFromStripe(user.id, sub, {
        planPriceId: sub.metadata?.planPriceId,
        invoiceId: invoice.id,
      });
      return;
    }
    await this.upsertSubscriptionFromStripe(userId, sub, {
      planPriceId: sub.metadata?.planPriceId,
      invoiceId: invoice.id,
    });
  }

  private async onSubscriptionChanged(sub: Stripe.Subscription) {
    let resolvedUserId = sub.metadata?.userId || '';
    if (!resolvedUserId) {
      const customerId =
        typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      if (customerId) {
        const user = await this.prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        });
        resolvedUserId = user?.id || '';
      }
    }
    if (!resolvedUserId) return;
    await this.upsertSubscriptionFromStripe(resolvedUserId, sub, {
      planPriceId: sub.metadata?.planPriceId,
    });
  }

  private mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'canceled':
        return SubscriptionStatus.CANCELED;
      case 'incomplete':
      case 'incomplete_expired':
        return SubscriptionStatus.INCOMPLETE;
      case 'unpaid':
      case 'paused':
        return SubscriptionStatus.EXPIRED;
      default:
        return SubscriptionStatus.INCOMPLETE;
    }
  }

  private async upsertSubscriptionFromStripe(
    userId: string,
    sub: Stripe.Subscription,
    hints?: {
      planPriceId?: string;
      planCode?: string;
      interval?: BillingInterval;
      invoiceId?: string;
    },
  ) {
    const stripePriceId = sub.items.data[0]?.price?.id;
    let planPrice = hints?.planPriceId
      ? await this.prisma.planPrice.findUnique({
          where: { id: hints.planPriceId },
          include: { plan: true },
        })
      : null;

    if (!planPrice && stripePriceId) {
      planPrice = await this.prisma.planPrice.findFirst({
        where: { stripePriceId },
        include: { plan: true },
      });
    }

    if (!planPrice && hints?.planCode && hints?.interval) {
      planPrice = await this.prisma.planPrice.findFirst({
        where: {
          interval: hints.interval,
          plan: { code: hints.planCode },
        },
        include: { plan: true },
      });
    }

    if (!planPrice) {
      this.logger.error(
        `Cannot map Stripe subscription ${sub.id} to a PlanPrice`,
      );
      return;
    }

    const status = this.mapStripeStatus(sub.status);
    // Stripe API 2025+: period lives on subscription items
    const item = sub.items?.data?.[0] as
      | (Stripe.SubscriptionItem & {
          current_period_start?: number;
          current_period_end?: number;
        })
      | undefined;
    const periodStartSec = item?.current_period_start;
    const periodEndSec = item?.current_period_end;
    const periodStart = periodStartSec
      ? new Date(periodStartSec * 1000)
      : null;
    const periodEnd = periodEndSec ? new Date(periodEndSec * 1000) : null;

    await this.prisma.userSubscription.upsert({
      where: { userId },
      create: {
        userId,
        planId: planPrice.planId,
        priceId: planPrice.id,
        status,
        interval: planPrice.interval,
        stripeSubscriptionId: sub.id,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
      update: {
        planId: planPrice.planId,
        priceId: planPrice.id,
        status,
        interval: planPrice.interval,
        stripeSubscriptionId: sub.id,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      },
    });

    // Grant credits ONLY on invoice.paid (avoids double grant with checkout/subscription.updated)
    if (
      hints?.invoiceId &&
      (status === SubscriptionStatus.ACTIVE ||
        status === SubscriptionStatus.TRIALING)
    ) {
      await this.credits.grantSubscriptionCredits({
        userId,
        amount: planPrice.creditsPerPeriod,
        reference: hints.invoiceId,
        meta: {
          planCode: planPrice.plan.code,
          interval: planPrice.interval,
          stripeSubscriptionId: sub.id,
          periodStart: periodStartSec ?? null,
        },
      });
    }

    if (
      status === SubscriptionStatus.CANCELED ||
      status === SubscriptionStatus.EXPIRED
    ) {
      this.logger.log(
        `Subscription ${status} user=${userId} sub=${sub.id} (credits kept until spent)`,
      );
    }
  }
}
