-- CreateEnum
CREATE TYPE "BudgetEntryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceMarket" AS ENUM ('ADX', 'OTHER');

-- CreateEnum
CREATE TYPE "FinanceAlertCondition" AS ENUM ('ABOVE', 'BELOW');

-- CreateTable
CREATE TABLE "budget_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BudgetEntryType" NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "market" "FinanceMarket" NOT NULL DEFAULT 'OTHER',
    "displayName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchlistItemId" TEXT,
    "symbol" TEXT NOT NULL,
    "condition" "FinanceAlertCondition" NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "currency" TEXT DEFAULT 'AED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "lastPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_entries_userId_occurredAt_idx" ON "budget_entries"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "budget_entries_userId_type_category_idx" ON "budget_entries"("userId", "type", "category");

-- CreateIndex
CREATE INDEX "watchlist_items_userId_market_idx" ON "watchlist_items"("userId", "market");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_userId_symbol_key" ON "watchlist_items"("userId", "symbol");

-- CreateIndex
CREATE INDEX "finance_alerts_userId_isActive_idx" ON "finance_alerts"("userId", "isActive");

-- CreateIndex
CREATE INDEX "finance_alerts_symbol_isActive_idx" ON "finance_alerts"("symbol", "isActive");

-- AddForeignKey
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_alerts" ADD CONSTRAINT "finance_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_alerts" ADD CONSTRAINT "finance_alerts_watchlistItemId_fkey" FOREIGN KEY ("watchlistItemId") REFERENCES "watchlist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
