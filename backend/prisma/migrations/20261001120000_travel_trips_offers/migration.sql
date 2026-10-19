-- CreateEnum
CREATE TYPE "TravelOfferKind" AS ENUM ('HOTEL', 'FLIGHT');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'PLANNED', 'READY_TO_BOOK', 'CANCELLED');

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "origin" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "adults" INTEGER NOT NULL DEFAULT 1,
    "budget" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "selectedHotelOfferId" TEXT,
    "selectedFlightOfferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_offers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tripId" TEXT,
    "kind" "TravelOfferKind" NOT NULL,
    "title" TEXT NOT NULL,
    "bookingUrl" TEXT NOT NULL,
    "snippet" TEXT,
    "source" TEXT,
    "price" DOUBLE PRECISION,
    "currency" TEXT,
    "stars" INTEGER,
    "airline" TEXT,
    "durationMinutes" INTEGER,
    "stops" INTEGER,
    "score" DOUBLE PRECISION,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trips_userId_createdAt_idx" ON "trips"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "trips_userId_status_idx" ON "trips"("userId", "status");

-- CreateIndex
CREATE INDEX "travel_offers_userId_kind_createdAt_idx" ON "travel_offers"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "travel_offers_tripId_idx" ON "travel_offers"("tripId");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_offers" ADD CONSTRAINT "travel_offers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_offers" ADD CONSTRAINT "travel_offers_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
