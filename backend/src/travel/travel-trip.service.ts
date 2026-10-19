import { Injectable, NotFoundException } from '@nestjs/common';
import { TripStatus, TravelOfferKind } from '@prisma/client';
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
  status?: TripStatus;
};

export type UpdateTripInput = Partial<CreateTripInput> & {
  selectedHotelOfferId?: string | null;
  selectedFlightOfferId?: string | null;
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
        ...(input.status !== undefined ? { status: input.status } : {}),
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
