import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditReason, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_CHAT_ATTACHMENT_EXTRA,
  DEFAULT_CHAT_CREDIT_COST,
  DEFAULT_SIGNUP_BONUS_CREDITS,
} from './billing.constants';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  signupBonusAmount() {
    return Number(
      this.config.get('SIGNUP_BONUS_CREDITS') || DEFAULT_SIGNUP_BONUS_CREDITS,
    );
  }

  chatCost(hasAttachments: boolean) {
    const base = Number(
      this.config.get('CHAT_CREDIT_COST') || DEFAULT_CHAT_CREDIT_COST,
    );
    const extra = hasAttachments
      ? Number(
          this.config.get('CHAT_ATTACHMENT_EXTRA_CREDITS') ||
            DEFAULT_CHAT_ATTACHMENT_EXTRA,
        )
      : 0;
    return Math.max(1, base + extra);
  }

  async getBalance(userId: string): Promise<number> {
    const row = await this.prisma.userCreditAccount.findUnique({
      where: { userId },
    });
    return row?.balance ?? 0;
  }

  async ensureAccount(userId: string) {
    await this.prisma.userCreditAccount.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
    });
  }

  /**
   * Idempotent signup bonus (one SIGNUP_BONUS ledger row per user).
   */
  async grantSignupBonus(userId: string) {
    const amount = this.signupBonusAmount();
    if (amount <= 0) return { granted: false, balance: await this.getBalance(userId) };

    const existing = await this.prisma.creditLedgerEntry.findFirst({
      where: { userId, reason: CreditReason.SIGNUP_BONUS },
    });
    if (existing) {
      return { granted: false, balance: await this.getBalance(userId) };
    }

    const balance = await this.applyDelta(userId, amount, CreditReason.SIGNUP_BONUS, {
      reference: 'signup',
    });
    this.logger.log(`Signup bonus +${amount} credits user=${userId}`);
    return { granted: true, balance };
  }

  async grantSubscriptionCredits(params: {
    userId: string;
    amount: number;
    reference: string;
    meta?: Record<string, unknown>;
  }) {
    if (params.amount <= 0) {
      return this.getBalance(params.userId);
    }
    // Idempotent per Stripe invoice / period reference
    const existing = await this.prisma.creditLedgerEntry.findFirst({
      where: {
        userId: params.userId,
        reason: CreditReason.SUBSCRIPTION_GRANT,
        reference: params.reference,
      },
    });
    if (existing) {
      return existing.balanceAfter;
    }
    return this.applyDelta(
      params.userId,
      params.amount,
      CreditReason.SUBSCRIPTION_GRANT,
      {
        reference: params.reference,
        meta: params.meta,
        replaceBalance: true,
      },
    );
  }

  /**
   * Spend credits for a chat turn. Throws 402 if insufficient.
   */
  async spendForChat(params: {
    userId: string;
    conversationId: string;
    hasAttachments: boolean;
  }) {
    // Existing users who never got a bonus still receive one-time free credits
    await this.grantSignupBonus(params.userId);
    const cost = this.chatCost(params.hasAttachments);
    const balance = await this.getBalance(params.userId);
    if (balance < cost) {
      throw new HttpException(
        {
          message: 'Insufficient credits for chat',
          errors: {
            credits: `Need ${cost} credits, balance is ${balance}`,
            balance,
            required: cost,
          },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    const after = await this.applyDelta(
      params.userId,
      -cost,
      CreditReason.CHAT_SPEND,
      {
        reference: params.conversationId,
        meta: { cost, hasAttachments: params.hasAttachments },
      },
    );
    return { spent: cost, balance: after };
  }

  /** Refund chat spend when the AI call fails after debit. */
  async refundChatSpend(params: {
    userId: string;
    conversationId: string;
    amount: number;
  }) {
    if (params.amount <= 0) return this.getBalance(params.userId);
    return this.applyDelta(params.userId, params.amount, CreditReason.REFUND, {
      reference: params.conversationId,
      meta: { reason: 'chat_ai_failed' },
    });
  }

  /**
   * @param replaceBalance — subscription renewals reset unused credits then grant period amount
   */
  private async applyDelta(
    userId: string,
    delta: number,
    reason: CreditReason,
    opts?: {
      reference?: string;
      meta?: Record<string, unknown>;
      replaceBalance?: boolean;
    },
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.userCreditAccount.upsert({
        where: { userId },
        create: { userId, balance: 0 },
        update: {},
      });

      const current = await tx.userCreditAccount.findUniqueOrThrow({
        where: { userId },
      });

      let next: number;
      if (opts?.replaceBalance && delta > 0) {
        next = delta;
      } else {
        next = current.balance + delta;
      }
      if (next < 0) {
        throw new HttpException(
          {
            message: 'Insufficient credits',
            errors: { balance: current.balance, required: Math.abs(delta) },
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      await tx.userCreditAccount.update({
        where: { userId },
        data: { balance: next },
      });

      await tx.creditLedgerEntry.create({
        data: {
          userId,
          delta: opts?.replaceBalance && delta > 0 ? delta - current.balance : delta,
          reason,
          balanceAfter: next,
          reference: opts?.reference,
          meta: (opts?.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      return next;
    });
  }
}
