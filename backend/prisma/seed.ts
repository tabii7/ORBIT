import {
  BillingInterval,
  PrismaClient,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Prices tuned for margin vs gpt-4o-mini + infra (~2–3¢/chat avg). */
const PLANS = [
  {
    code: 'basic',
    name: 'Basic',
    description: '~50 chats/month — try ORBIT daily.',
    sortOrder: 1,
    monthly: {
      amountCents: 999, // $9.99
      credits: 150,
      envPrice: 'STRIPE_PRICE_BASIC_MONTHLY',
    },
    yearly: {
      amountCents: 9900, // $99 (~2 months free)
      credits: 1800,
      envPrice: 'STRIPE_PRICE_BASIC_YEARLY',
    },
  },
  {
    code: 'plus',
    name: 'Plus',
    description: '~200 chats/month — travel, finance, health daily.',
    sortOrder: 2,
    monthly: {
      amountCents: 2499, // $24.99
      credits: 600,
      envPrice: 'STRIPE_PRICE_PLUS_MONTHLY',
    },
    yearly: {
      amountCents: 24900, // $249
      credits: 7200,
      envPrice: 'STRIPE_PRICE_PLUS_YEARLY',
    },
  },
  {
    code: 'pro',
    name: 'Pro',
    description: '~650 chats/month — power users & attachments.',
    sortOrder: 3,
    monthly: {
      amountCents: 4999, // $49.99
      credits: 2000,
      envPrice: 'STRIPE_PRICE_PRO_MONTHLY',
    },
    yearly: {
      amountCents: 49900, // $499
      credits: 24000,
      envPrice: 'STRIPE_PRICE_PRO_YEARLY',
    },
  },
] as const;

async function seedPlans() {
  for (const p of PLANS) {
    const plan = await prisma.subscriptionPlan.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        description: p.description,
        sortOrder: p.sortOrder,
        isActive: true,
      },
      create: {
        code: p.code,
        name: p.name,
        description: p.description,
        sortOrder: p.sortOrder,
        isActive: true,
      },
    });

    for (const [interval, cfg] of [
      [BillingInterval.MONTHLY, p.monthly],
      [BillingInterval.YEARLY, p.yearly],
    ] as const) {
      const stripePriceId = (process.env[cfg.envPrice] || '').trim() || null;
      await prisma.planPrice.upsert({
        where: {
          planId_interval: { planId: plan.id, interval },
        },
        update: {
          amountCents: cfg.amountCents,
          currency: 'usd',
          creditsPerPeriod: cfg.credits,
          ...(stripePriceId ? { stripePriceId } : {}),
        },
        create: {
          planId: plan.id,
          interval,
          amountCents: cfg.amountCents,
          currency: 'usd',
          creditsPerPeriod: cfg.credits,
          stripePriceId,
        },
      });
    }
    console.log(`Plan ready: ${p.code}`);
  }
}

async function main() {
  const email = (
    process.env.SUPERADMIN_EMAIL || 'superadmin@orbit.local'
  ).toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@123';
  const fullName = process.env.SUPERADMIN_NAME || 'Orbit Super Admin';

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      fullName,
      role: Role.SUPERADMIN,
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      fullName,
      role: Role.SUPERADMIN,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  console.log('SuperAdmin ready:');
  console.log(`  email: ${user.email}`);
  console.log(`  role:  ${user.role}`);

  await seedPlans();
  console.log('Subscription plans seeded (basic / plus / pro × monthly+yearly).');
  console.log(
    'Set STRIPE_PRICE_* env vars then re-run seed to attach Stripe price IDs.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
