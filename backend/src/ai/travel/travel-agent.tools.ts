import {
  TravelCabinClass,
  ReminderRecurrence,
  ReminderType,
  TravelOfferKind,
  TripStatus,
} from '@prisma/client';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { RemindersService } from '../../reminders/reminders.service';
import { resolveRemindAt } from '../../common/time/remind-at';
import { TravelPreferencesService } from '../../travel/travel-preferences.service';
import { TravelSearchService } from '../../travel/travel-search.service';
import { TravelCompareService } from '../../travel/travel-compare.service';
import { TravelTripService } from '../../travel/travel-trip.service';
import { UpdateTravelPreferencesDto } from '../../travel/dto/travel-preferences.dto';

export type TravelAgentAction = Record<string, unknown>;

function mapHit(r: {
  title: string;
  url: string;
  content: string;
  price?: number;
  currency?: string;
  stars?: number;
  airline?: string;
  durationMinutes?: number;
  stops?: number;
}) {
  return {
    title: r.title,
    url: r.url,
    content: r.content,
    bookingUrl: r.url,
    snippet: r.content,
    price: r.price,
    currency: r.currency,
    stars: r.stars,
    airline: r.airline,
    durationMinutes: r.durationMinutes,
    stops: r.stops,
  };
}

export function createTravelAgentTools(deps: {
  userId: string;
  timezone: string;
  travelPreferencesService: TravelPreferencesService;
  travelSearchService: TravelSearchService;
  travelCompareService: TravelCompareService;
  travelTripService: TravelTripService;
  remindersService: RemindersService;
  actions: TravelAgentAction[];
}) {
  const {
    userId,
    timezone,
    travelPreferencesService,
    travelSearchService,
    travelCompareService,
    travelTripService,
    remindersService,
    actions,
  } = deps;

  const getTravelPreferences = tool(
    async () => {
      const prefs = await travelPreferencesService.get(userId);
      return JSON.stringify(prefs);
    },
    {
      name: 'get_travel_preferences',
      description:
        'Fetch saved travel preferences: home city/airport, budgets, hotel stars, airlines, cabin class.',
      schema: z.object({}),
    },
  );

  const saveTravelPreferences = tool(
    async (input) => {
      const dto: UpdateTravelPreferencesDto = {};
      if (input.home_city !== undefined) dto.homeCity = input.home_city;
      if (input.home_country !== undefined) dto.homeCountry = input.home_country;
      if (input.home_airport !== undefined) dto.homeAirport = input.home_airport;
      if (input.preferred_currency !== undefined)
        dto.preferredCurrency = input.preferred_currency;
      if (input.max_hotel_budget !== undefined)
        dto.maxHotelBudget = input.max_hotel_budget;
      if (input.max_flight_budget !== undefined)
        dto.maxFlightBudget = input.max_flight_budget;
      if (input.preferred_hotel_stars !== undefined)
        dto.preferredHotelStars = input.preferred_hotel_stars;
      if (input.preferred_airlines !== undefined)
        dto.preferredAirlines = input.preferred_airlines;
      if (input.cabin_class !== undefined) {
        const map: Record<string, TravelCabinClass> = {
          ECONOMY: TravelCabinClass.ECONOMY,
          PREMIUM_ECONOMY: TravelCabinClass.PREMIUM_ECONOMY,
          BUSINESS: TravelCabinClass.BUSINESS,
          FIRST: TravelCabinClass.FIRST,
        };
        dto.cabinClass = map[input.cabin_class.toUpperCase()];
      }
      if (input.prefer_refundable !== undefined)
        dto.preferRefundable = input.prefer_refundable;
      if (input.adults_default !== undefined)
        dto.adultsDefault = input.adults_default;
      if (input.notes !== undefined) dto.notes = input.notes;

      const saved = await travelPreferencesService.upsert(userId, dto);
      actions.push({
        type: 'TRAVEL_PREFERENCES_UPDATED',
        data: saved,
      });
      return JSON.stringify({ ok: true, preferences: saved });
    },
    {
      name: 'save_travel_preferences',
      description:
        'Save or update travel preferences from chat (home city, budgets, stars, airlines, cabin).',
      schema: z.object({
        home_city: z.string().optional(),
        home_country: z.string().optional(),
        home_airport: z.string().optional(),
        preferred_currency: z.string().optional(),
        max_hotel_budget: z.number().optional(),
        max_flight_budget: z.number().optional(),
        preferred_hotel_stars: z.number().int().min(1).max(5).optional(),
        preferred_airlines: z.array(z.string()).optional(),
        cabin_class: z
          .enum([
            'ECONOMY',
            'PREMIUM_ECONOMY',
            'BUSINESS',
            'FIRST',
            'economy',
            'premium_economy',
            'business',
            'first',
          ])
          .optional(),
        prefer_refundable: z.boolean().optional(),
        adults_default: z.number().int().min(1).max(9).optional(),
        notes: z.string().optional(),
      }),
    },
  );

  const searchHotels = tool(
    async (input) => {
      const prefs = await travelPreferencesService.get(userId);
      const result = await travelSearchService.searchHotels({
        destination: input.destination,
        checkIn: input.check_in,
        checkOut: input.check_out,
        budget: input.budget ?? prefs.maxHotelBudget ?? undefined,
        currency: input.currency ?? prefs.preferredCurrency,
        stars: input.stars ?? prefs.preferredHotelStars ?? undefined,
        adults: input.adults ?? prefs.adultsDefault,
      });

      const comparison = result.ok
        ? await travelCompareService.compareAndRecommend({
            userId,
            kind: TravelOfferKind.HOTEL,
            hits: result.results.map(mapHit),
            tripId: input.trip_id,
            persist: true,
          })
        : null;

      actions.push({
        type: 'TRAVEL_HOTEL_SEARCH',
        data: {
          destination: input.destination,
          resultCount: result.results.length,
          ok: result.ok,
          bestMatch: comparison?.recommendation?.title,
        },
      });

      return JSON.stringify({
        ok: result.ok,
        answer: result.answer,
        error: result.error,
        preferencesUsed: {
          budget: input.budget ?? prefs.maxHotelBudget,
          currency: input.currency ?? prefs.preferredCurrency,
          stars: input.stars ?? prefs.preferredHotelStars,
          adults: input.adults ?? prefs.adultsDefault,
        },
        comparison,
        recommendation: comparison?.recommendation ?? null,
        results: (comparison?.comparison ?? []).map((r) => ({
          rank: r.rank,
          offerId: r.offerId,
          title: r.title,
          bookingUrl: r.bookingUrl,
          snippet: r.snippet,
          price: r.price,
          currency: r.currency,
          stars: r.stars,
          source: r.source,
          score: r.score,
          reasons: r.reasons,
        })),
        instruction:
          'Lead with the recommendation (rank 1), then briefly compare 2–3 alternatives with markdown links to bookingUrl. Cite score reasons. Never invent URLs. Never book or pay.',
      });
    },
    {
      name: 'search_hotels',
      description:
        'Web-search hotels, score/compare against prefs, persist ranked offers. Returns recommendation + booking URLs.',
      schema: z.object({
        destination: z.string().describe('City or area, e.g. Dubai Marina'),
        check_in: z.string().optional().describe('YYYY-MM-DD'),
        check_out: z.string().optional().describe('YYYY-MM-DD'),
        budget: z.number().optional(),
        currency: z.string().optional(),
        stars: z.number().int().min(1).max(5).optional(),
        adults: z.number().int().min(1).max(9).optional(),
        trip_id: z
          .string()
          .optional()
          .describe('Attach scored offers to this trip if planning'),
      }),
    },
  );

  const searchFlights = tool(
    async (input) => {
      const prefs = await travelPreferencesService.get(userId);
      const origin =
        input.origin ||
        prefs.homeAirport ||
        prefs.homeCity ||
        'Dubai';
      const airline =
        input.airline ||
        (prefs.preferredAirlines.length ? prefs.preferredAirlines[0] : undefined);

      const result = await travelSearchService.searchFlights({
        origin,
        destination: input.destination,
        departDate: input.depart_date,
        returnDate: input.return_date,
        budget: input.budget ?? prefs.maxFlightBudget ?? undefined,
        currency: input.currency ?? prefs.preferredCurrency,
        cabin: input.cabin || prefs.cabinClass,
        adults: input.adults ?? prefs.adultsDefault,
        airline,
      });

      const comparison = result.ok
        ? await travelCompareService.compareAndRecommend({
            userId,
            kind: TravelOfferKind.FLIGHT,
            hits: result.results.map(mapHit),
            tripId: input.trip_id,
            persist: true,
          })
        : null;

      actions.push({
        type: 'TRAVEL_FLIGHT_SEARCH',
        data: {
          origin,
          destination: input.destination,
          resultCount: result.results.length,
          ok: result.ok,
          bestMatch: comparison?.recommendation?.title,
        },
      });

      return JSON.stringify({
        ok: result.ok,
        answer: result.answer,
        error: result.error,
        preferencesUsed: {
          origin,
          budget: input.budget ?? prefs.maxFlightBudget,
          currency: input.currency ?? prefs.preferredCurrency,
          cabin: input.cabin || prefs.cabinClass,
          airline,
          adults: input.adults ?? prefs.adultsDefault,
        },
        comparison,
        recommendation: comparison?.recommendation ?? null,
        results: (comparison?.comparison ?? []).map((r) => ({
          rank: r.rank,
          offerId: r.offerId,
          title: r.title,
          bookingUrl: r.bookingUrl,
          snippet: r.snippet,
          price: r.price,
          currency: r.currency,
          airline: r.airline,
          durationMinutes: r.durationMinutes,
          stops: r.stops,
          source: r.source,
          score: r.score,
          reasons: r.reasons,
        })),
        instruction:
          'Lead with the recommendation (rank 1), then briefly compare 2–3 alternatives with markdown links to bookingUrl. Cite score reasons. Never invent URLs. Never book or pay.',
      });
    },
    {
      name: 'search_flights',
      description:
        'Web-search flights, score/compare against prefs, persist ranked offers. Returns recommendation + booking URLs.',
      schema: z.object({
        destination: z.string(),
        origin: z
          .string()
          .optional()
          .describe('City or airport code; defaults to travel preferences'),
        depart_date: z.string().optional().describe('YYYY-MM-DD'),
        return_date: z.string().optional().describe('YYYY-MM-DD'),
        budget: z.number().optional(),
        currency: z.string().optional(),
        cabin: z.string().optional(),
        adults: z.number().int().min(1).max(9).optional(),
        airline: z.string().optional(),
        trip_id: z
          .string()
          .optional()
          .describe('Attach scored offers to this trip if planning'),
      }),
    },
  );

  const createTrip = tool(
    async (input) => {
      const prefs = await travelPreferencesService.get(userId);
      const trip = await travelTripService.create(userId, {
        title: input.title,
        destination: input.destination,
        origin:
          input.origin ||
          prefs.homeAirport ||
          prefs.homeCity ||
          undefined,
        startDate: input.start_date,
        endDate: input.end_date,
        adults: input.adults ?? prefs.adultsDefault,
        budget: input.budget,
        currency: input.currency ?? prefs.preferredCurrency,
        notes: input.notes,
        status: TripStatus.PLANNED,
      });

      actions.push({
        type: 'TRIP_CREATED',
        data: { id: trip.id, title: trip.title, destination: trip.destination },
      });

      return JSON.stringify({
        ok: true,
        trip,
        next:
          'Call search_hotels and/or search_flights with trip_id to attach compared offers, or use plan_trip for one-shot planning.',
      });
    },
    {
      name: 'create_trip',
      description:
        'Create a saved trip plan shell (destination, dates, budget). Use before or after search; pass trip_id into searches to attach offers.',
      schema: z.object({
        title: z.string().describe('e.g. Istanbul weekend'),
        destination: z.string(),
        origin: z.string().optional(),
        start_date: z.string().optional().describe('YYYY-MM-DD'),
        end_date: z.string().optional().describe('YYYY-MM-DD'),
        adults: z.number().int().min(1).max(9).optional(),
        budget: z.number().optional(),
        currency: z.string().optional(),
        notes: z.string().optional(),
      }),
    },
  );

  const listTrips = tool(
    async () => {
      const trips = await travelTripService.list(userId);
      return JSON.stringify({
        ok: true,
        count: trips.length,
        trips: trips.map((t) => ({
          id: t.id,
          title: t.title,
          destination: t.destination,
          origin: t.origin,
          startDate: t.startDate,
          endDate: t.endDate,
          status: t.status,
          offerCount: t.offers.length,
          selectedHotelOfferId: t.selectedHotelOfferId,
          selectedFlightOfferId: t.selectedFlightOfferId,
        })),
      });
    },
    {
      name: 'list_trips',
      description: 'List saved trips with status and offer counts.',
      schema: z.object({}),
    },
  );

  const getTrip = tool(
    async (input) => {
      const trip = await travelTripService.get(userId, input.trip_id);
      return JSON.stringify({ ok: true, trip });
    },
    {
      name: 'get_trip',
      description: 'Fetch one trip with ranked hotel/flight offers.',
      schema: z.object({
        trip_id: z.string(),
      }),
    },
  );

  const selectTripOffer = tool(
    async (input) => {
      const kind =
        input.kind.toUpperCase() === 'FLIGHT'
          ? TravelOfferKind.FLIGHT
          : TravelOfferKind.HOTEL;
      const result = await travelTripService.selectOffer(
        userId,
        input.trip_id,
        input.offer_id,
        kind,
      );
      actions.push({
        type: 'TRIP_OFFER_SELECTED',
        data: {
          tripId: input.trip_id,
          offerId: input.offer_id,
          kind,
          bookingUrl: result.bookingUrl,
        },
      });
      return JSON.stringify({
        ok: true,
        ...result,
        instruction:
          'Share the bookingUrl as a markdown link. User completes booking externally — do not collect payment.',
      });
    },
    {
      name: 'select_trip_offer',
      description:
        'Mark a hotel or flight offer as selected on a trip and return its booking URL.',
      schema: z.object({
        trip_id: z.string(),
        offer_id: z.string(),
        kind: z.enum(['HOTEL', 'FLIGHT', 'hotel', 'flight']),
      }),
    },
  );

  const planTrip = tool(
    async (input) => {
      const prefs = await travelPreferencesService.get(userId);
      const origin =
        input.origin ||
        prefs.homeAirport ||
        prefs.homeCity ||
        'Dubai';

      const trip = await travelTripService.create(userId, {
        title: input.title || `Trip to ${input.destination}`,
        destination: input.destination,
        origin,
        startDate: input.start_date,
        endDate: input.end_date,
        adults: input.adults ?? prefs.adultsDefault,
        budget: input.budget,
        currency: input.currency ?? prefs.preferredCurrency,
        notes: input.notes,
        status: TripStatus.PLANNED,
      });

      const includeHotels = input.include_hotels !== false;
      const includeFlights = input.include_flights !== false;

      let hotels: Awaited<
        ReturnType<TravelCompareService['compareAndRecommend']>
      > | null = null;
      let flights: Awaited<
        ReturnType<TravelCompareService['compareAndRecommend']>
      > | null = null;

      if (includeHotels) {
        const hotelSearch = await travelSearchService.searchHotels({
          destination: input.destination,
          checkIn: input.start_date,
          checkOut: input.end_date,
          budget: input.hotel_budget ?? prefs.maxHotelBudget ?? undefined,
          currency: input.currency ?? prefs.preferredCurrency,
          stars: prefs.preferredHotelStars ?? undefined,
          adults: input.adults ?? prefs.adultsDefault,
        });
        if (hotelSearch.ok) {
          hotels = await travelCompareService.compareAndRecommend({
            userId,
            kind: TravelOfferKind.HOTEL,
            hits: hotelSearch.results.map(mapHit),
            tripId: trip.id,
            persist: true,
          });
        }
      }

      if (includeFlights) {
        const flightSearch = await travelSearchService.searchFlights({
          origin,
          destination: input.destination,
          departDate: input.start_date,
          returnDate: input.end_date,
          budget: input.flight_budget ?? prefs.maxFlightBudget ?? undefined,
          currency: input.currency ?? prefs.preferredCurrency,
          cabin: prefs.cabinClass,
          adults: input.adults ?? prefs.adultsDefault,
          airline: prefs.preferredAirlines[0],
        });
        if (flightSearch.ok) {
          flights = await travelCompareService.compareAndRecommend({
            userId,
            kind: TravelOfferKind.FLIGHT,
            hits: flightSearch.results.map(mapHit),
            tripId: trip.id,
            persist: true,
          });
        }
      }

      const refreshed = await travelTripService.get(userId, trip.id);

      actions.push({
        type: 'TRIP_PLANNED',
        data: {
          tripId: trip.id,
          destination: trip.destination,
          hotelBest: hotels?.recommendation?.title,
          flightBest: flights?.recommendation?.title,
        },
      });

      return JSON.stringify({
        ok: true,
        trip: refreshed,
        hotels,
        flights,
        recommendation: {
          hotel: hotels?.recommendation ?? null,
          flight: flights?.recommendation ?? null,
        },
        instruction:
          'Present a short trip plan: destination/dates, top hotel pick, top flight pick, with markdown booking links. Offer to select_trip_offer or create_travel_reminder. Never book/pay.',
      });
    },
    {
      name: 'plan_trip',
      description:
        'One-shot trip planning: create trip, search hotels and flights, compare/rank, attach offers, return dual recommendations.',
      schema: z.object({
        destination: z.string(),
        title: z.string().optional(),
        origin: z.string().optional(),
        start_date: z.string().optional().describe('YYYY-MM-DD'),
        end_date: z.string().optional().describe('YYYY-MM-DD'),
        adults: z.number().int().min(1).max(9).optional(),
        budget: z.number().optional(),
        hotel_budget: z.number().optional(),
        flight_budget: z.number().optional(),
        currency: z.string().optional(),
        notes: z.string().optional(),
        include_hotels: z.boolean().optional(),
        include_flights: z.boolean().optional(),
      }),
    },
  );

  const createTravelReminder = tool(
    async (input) => {
      const remindAt = resolveRemindAt({
        remindAtIso: input.remind_at_iso,
        timezone,
      });

      const reminder = await remindersService.createReminder(userId, {
        type: ReminderType.TRAVEL,
        title: input.title,
        description: input.description,
        remindAt,
        recurrence: ReminderRecurrence.ONCE,
        timezone,
      });

      actions.push({
        type: 'REMINDER_CREATED',
        data: {
          id: reminder.id,
          type: reminder.type,
          title: reminder.title,
          remindAt: reminder.remindAt,
        },
      });

      return JSON.stringify({
        ok: true,
        reminderId: reminder.id,
        remindAt: reminder.remindAt,
        timezone,
      });
    },
    {
      name: 'create_travel_reminder',
      description:
        'Create a TRAVEL reminder for flight departure, hotel check-in, or trip dates. Use after user confirms trip plans or asks to be reminded.',
      schema: z.object({
        title: z.string().describe('e.g. Flight DXB→IST departs'),
        description: z
          .string()
          .optional()
          .describe('Include destination, booking link, times'),
        remind_at_iso: z
          .string()
          .describe('ISO datetime when to remind (user timezone aware)'),
      }),
    },
  );

  return [
    getTravelPreferences,
    saveTravelPreferences,
    searchHotels,
    searchFlights,
    createTrip,
    listTrips,
    getTrip,
    selectTripOffer,
    planTrip,
    createTravelReminder,
  ];
}
