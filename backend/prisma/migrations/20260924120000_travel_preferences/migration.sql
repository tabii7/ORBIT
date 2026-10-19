-- AlterEnum
ALTER TYPE "ReminderType" ADD VALUE 'TRAVEL';

-- CreateEnum
CREATE TYPE "TravelCabinClass" AS ENUM ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST');

-- CreateTable
CREATE TABLE "travel_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "homeCity" TEXT,
    "homeCountry" TEXT,
    "homeAirport" TEXT,
    "preferredCurrency" TEXT NOT NULL DEFAULT 'AED',
    "maxHotelBudget" DOUBLE PRECISION,
    "maxFlightBudget" DOUBLE PRECISION,
    "preferredHotelStars" INTEGER,
    "preferredAirlines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cabinClass" "TravelCabinClass" NOT NULL DEFAULT 'ECONOMY',
    "preferRefundable" BOOLEAN NOT NULL DEFAULT false,
    "adultsDefault" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "travel_preferences_userId_key" ON "travel_preferences"("userId");

ALTER TABLE "travel_preferences" ADD CONSTRAINT "travel_preferences_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
