import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TripStatus, TravelOfferKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateTripInput = {
  title: string;
  destination: string;
  origin?: string;
  startDate?: string;
  endDate?: string;
  adults?: number;
  budget?: number;
  currency?: string;
  notes?: string;
  purpose?: string;
  status?: TripStatus;
};

export type UpdateTripInput = Partial<CreateTripInput> & {
  selectedHotelOfferId?: string | null;
  selectedFlightOfferId?: string | null;
  itinerary?: unknown;
};

export type TripExpenseInput = {
  category: string;
  amount: number;
  currency?: string;
  note?: string;
};

export type SaveOfferInput = {
  kind: TravelOfferKind;
  title: string;
  bookingUrl: string;
  snippet?: string;
  source?: string;
  price?: number;
  currency?: string;
  stars?: number;
  airline?: string;
  durationMinutes?: number;
  stops?: number;
  score?: number;
  isRecommended?: boolean;
  tripId?: string;
};

@Injectable()
export class TravelTripService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.trip.findMany({
      where: { userId },
      include: {
        offers: { orderBy: [{ isRecommended: 'desc' }, { score: 'desc' }] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(userId: string, id: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, userId },
      include: {
        offers: { orderBy: [{ isRecommended: 'desc' }, { score: 'desc' }] },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  create(userId: string, input: CreateTripInput) {
    return this.prisma.trip.create({
      data: {
        userId,
        title: input.title,
        destination: input.destination,
        origin: input.origin,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
        adults: input.adults ?? 1,
        budget: input.budget,
        currency: input.currency ?? 'AED',
        notes: input.notes,
        purpose: input.purpose,
        status: input.status ?? TripStatus.DRAFT,
      },
      include: { offers: true },
    });
  }

  async update(userId: string, id: string, input: UpdateTripInput) {
    await this.get(userId, id);
    return this.prisma.trip.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.destination !== undefined
          ? { destination: input.destination }
          : {}),
        ...(input.origin !== undefined ? { origin: input.origin } : {}),
        ...(input.startDate !== undefined
          ? { startDate: input.startDate ? new Date(input.startDate) : null }
          : {}),
        ...(input.endDate !== undefined
          ? { endDate: input.endDate ? new Date(input.endDate) : null }
          : {}),
        ...(input.adults !== undefined ? { adults: input.adults } : {}),
        ...(input.budget !== undefined ? { budget: input.budget } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.itinerary !== undefined
          ? { itinerary: input.itinerary as Prisma.InputJsonValue }
          : {}),
        ...(input.selectedHotelOfferId !== undefined
          ? { selectedHotelOfferId: input.selectedHotelOfferId }
          : {}),
        ...(input.selectedFlightOfferId !== undefined
          ? { selectedFlightOfferId: input.selectedFlightOfferId }
          : {}),
      },
      include: {
        offers: { orderBy: [{ isRecommended: 'desc' }, { score: 'desc' }] },
      },
    });
  }

  /** H — dashboard: trip + offers + expenses vs budget */
  async getDashboard(userId: string, id: string) {
    const trip = await this.get(userId, id);
    const expenses = this.parseExpenses(trip.expenseLog);
    const spent = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const budget = trip.budget ?? null;
    return {
      trip: {
        id: trip.id,
        title: trip.title,
        destination: trip.destination,
        origin: trip.origin,
        startDate: trip.startDate,
        endDate: trip.endDate,
        adults: trip.adults,
        budget: trip.budget,
        currency: trip.currency,
        purpose: trip.purpose,
        status: trip.status,
        notes: trip.notes,
        itinerary: trip.itinerary,
        selectedHotelOfferId: trip.selectedHotelOfferId,
        selectedFlightOfferId: trip.selectedFlightOfferId,
      },
      offers: trip.offers.map((o) => ({
        id: o.id,
        kind: o.kind,
        title: o.title,
        bookingUrl: o.bookingUrl,
        price: o.price,
        currency: o.currency,
        source: o.source,
        score: o.score,
        isRecommended: o.isRecommended,
        external: true,
      })),
      expenses,
      budgetSummary: {
        plannedBudget: budget,
        spent,
        remaining: budget != null ? budget - spent : null,
        currency: trip.currency,
        note: 'Spent is from logged expenses only; booking prices on partner sites may differ.',
      },
    };
  }

  async addExpense(userId: string, tripId: string, input: TripExpenseInput) {
    if (!(input.amount > 0)) {
      throw new BadRequestException('amount must be positive');
    }
    const trip = await this.get(userId, tripId);
    const expenses = this.parseExpenses(trip.expenseLog);
    expenses.push({
      category: input.category.trim().slice(0, 80),
      amount: input.amount,
      currency: (input.currency || trip.currency || 'AED').slice(0, 8),
      note: input.note?.trim().slice(0, 200) || null,
      at: new Date().toISOString(),
    });
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { expenseLog: expenses as unknown as Prisma.InputJsonValue },
      include: {
        offers: { orderBy: [{ isRecommended: 'desc' }, { score: 'desc' }] },
      },
    });
    return this.getDashboard(userId, updated.id);
  }

  async saveItinerary(userId: string, tripId: string, itinerary: unknown) {
    await this.get(userId, tripId);
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { itinerary: itinerary as Prisma.InputJsonValue },
    });
    return this.getDashboard(userId, tripId);
  }

  private parseExpenses(raw: unknown): Array<{
    category: string;
    amount: number;
    currency: string;
    note: string | null;
    at: string;
  }> {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (e: { category?: string; amount?: number }) =>
          e && typeof e.category === 'string' && typeof e.amount === 'number',
      )
      .map((e: Record<string, unknown>) => ({
        category: String(e.category),
        amount: Number(e.amount),
        currency: e.currency ? String(e.currency) : 'AED',
        note: e.note ? String(e.note) : null,
        at: e.at ? String(e.at) : '',
      }));
  }

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await this.prisma.trip.delete({ where: { id } });
    return { ok: true, deleted: true, id };
  }

  async saveOffers(userId: string, offers: SaveOfferInput[]) {
    if (!offers.length) return [];
    const created = await this.prisma.$transaction(
      offers.map((o) =>
        this.prisma.travelOffer.create({
          data: {
            userId,
            tripId: o.tripId,
            kind: o.kind,
            title: o.title,
            bookingUrl: o.bookingUrl,
            snippet: o.snippet,
            source: o.source,
            price: o.price,
            currency: o.currency,
            stars: o.stars,
            airline: o.airline,
            durationMinutes: o.durationMinutes,
            stops: o.stops,
            score: o.score,
            isRecommended: o.isRecommended ?? false,
          },
        }),
      ),
    );
    return created;
  }

  async attachOffersToTrip(
    userId: string,
    tripId: string,
    offerIds: string[],
  ) {
    await this.get(userId, tripId);
    await this.prisma.travelOffer.updateMany({
      where: { userId, id: { in: offerIds } },
      data: { tripId },
    });
    return this.get(userId, tripId);
  }

  async selectOffer(
    userId: string,
    tripId: string,
    offerId: string,
    kind: TravelOfferKind,
  ) {
    const trip = await this.get(userId, tripId);
    const offer = await this.prisma.travelOffer.findFirst({
      where: { id: offerId, userId },
    });
    if (!offer) throw new NotFoundException('Travel offer not found');

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        ...(kind === TravelOfferKind.HOTEL
          ? { selectedHotelOfferId: offerId }
          : { selectedFlightOfferId: offerId }),
        status: TripStatus.READY_TO_BOOK,
      },
      include: {
        offers: { orderBy: [{ isRecommended: 'desc' }, { score: 'desc' }] },
      },
    });

    return {
      trip: updated,
      selectedOffer: offer,
      bookingUrl: offer.bookingUrl,
    };
  }
}
