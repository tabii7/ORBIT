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
import { TravelPlannerService } from '../../travel/travel-planner.service';
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
  travelPlannerService: TravelPlannerService;
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
    travelPlannerService,
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
          provider: r.provider,
          url: r.url || r.bookingUrl,
          bookingUrl: r.bookingUrl,
          snippet: r.snippet,
          priceEstimate: r.priceEstimate ?? r.price,
          price: r.price,
          currency: r.currency,
          stars: r.stars,
          source: r.source,
          external: true,
          score: r.score,
          reasons: r.reasons,
        })),
        disclaimer:
          comparison?.disclaimer ||
          'Prices are estimates. User books on the external hotel platform (Booking.com, Agoda, Hotels.com, Expedia, Kayak, etc.).',
        instruction:
          'Lead with rank 1. Name the provider (e.g. Booking.com). Link with markdown. Say price is an estimate and booking is external — ORBIT does not charge or complete bookings. Never invent URLs.',
      });
    },
    {
      name: 'search_hotels',
      description:
        'Web-search hotels on international OTAs (Booking.com, Agoda, Hotels.com, Expedia, Kayak), score/compare, return ranked offers with provider + external booking URLs.',
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

  const searchTravelDeals = tool(
    async (input) => {
      const result = await travelSearchService.searchTravelDeals({
        query: input.query,
        destination: input.destination,
        scope: input.scope,
      });
      actions.push({
        type: 'TRAVEL_DEALS_SEARCH',
        data: {
          query: input.query,
          ok: result.ok,
          dealCount: result.deals.length,
        },
      });
      return JSON.stringify({
        ok: result.ok,
        summary: result.summary,
        error: result.error,
        deals: result.deals,
        disclaimer: result.disclaimer,
        instruction:
          'Be straightforward. Only report deals returned by this tool. If deals is empty, say no verified deals were found — do not invent codes, savings, or links. For each deal: provider + code only if non-null + sourceUrl markdown link + terms if present. Tell user to verify on the partner site. ORBIT does not apply coupons or book.',
      });
    },
    {
      name: 'search_travel_deals',
      description:
        'Web-search real travel coupons/promos only. Returns only verified search results. Never invent codes or URLs. Empty list if none found.',
      schema: z.object({
        query: z
          .string()
          .describe(
            'What to search, e.g. "Dubai hotel promo codes October" or "Emirates flight sale"',
          ),
        destination: z.string().optional(),
        scope: z
          .enum(['hotel', 'flight', 'package', 'any'])
          .optional()
          .describe('Narrow to hotels, flights, packages, or any'),
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
      const dashboard = await travelTripService.getDashboard(
        userId,
        input.trip_id,
      );
      return JSON.stringify({
        ok: true,
        ...dashboard,
        instruction:
          'Present as a trip dashboard: dates, selected offers with external links, itinerary if any, budget vs spent. Do not invent bookings.',
      });
    },
    {
      name: 'get_trip',
      description:
        'Trip dashboard: details, hotel/flight offers, saved itinerary, expenses vs budget.',
      schema: z.object({
        trip_id: z.string(),
      }),
    },
  );

  const recommendDestinations = tool(
    async (input) => {
      const result = await travelPlannerService.recommendDestinations({
        interests: input.interests,
        budget: input.budget,
        currency: input.currency,
        travelPurpose: input.purpose,
        dates: input.dates,
        weatherPref: input.weather,
        origin: input.origin,
      });
      actions.push({
        type: 'TRAVEL_DESTINATIONS',
        data: { ok: result.ok, count: result.data.destinations.length },
      });
      return JSON.stringify({
        ...result,
        instruction:
          'List destinations with why/bestFor. Only use returned items. Link sourceUrl when present. Estimates only.',
      });
    },
    {
      name: 'recommend_destinations',
      description:
        'Suggest destinations by interests, budget, purpose (family/adventure/etc), dates, weather. Web search; no invented places.',
      schema: z.object({
        interests: z.string().optional(),
        purpose: z
          .string()
          .optional()
          .describe('family | adventure | relaxation | culture | shopping | business'),
        budget: z.number().optional(),
        currency: z.string().optional(),
        dates: z.string().optional(),
        weather: z.string().optional(),
        origin: z.string().optional(),
      }),
    },
  );

  const estimateTravelBudget = tool(
    async (input) => {
      const result = await travelPlannerService.estimateTravelBudget({
        destination: input.destination,
        nights: input.nights,
        adults: input.adults,
        totalBudget: input.total_budget,
        currency: input.currency,
        style: input.style,
      });
      actions.push({
        type: 'TRAVEL_BUDGET_ESTIMATE',
        data: { destination: input.destination, ok: result.ok },
      });
      return JSON.stringify({
        ...result,
        instruction:
          'Show breakdown as ESTIMATES only. Cite sources if present. Never claim confirmed booking prices.',
      });
    },
    {
      name: 'estimate_travel_budget',
      description:
        'Estimate trip cost breakdown (flights, hotel, transport, food, activities). Estimates only.',
      schema: z.object({
        destination: z.string(),
        nights: z.number().int().min(1).max(30).optional(),
        adults: z.number().int().min(1).max(9).optional(),
        total_budget: z.number().optional(),
        currency: z.string().optional(),
        style: z.string().optional(),
      }),
    },
  );

  const searchLocalTransport = tool(
    async (input) => {
      const result = await travelPlannerService.searchLocalTransport({
        destination: input.destination,
        need: input.need,
        from: input.from,
        to: input.to,
      });
      actions.push({
        type: 'TRAVEL_LOCAL_TRANSPORT',
        data: { destination: input.destination, ok: result.ok },
      });
      return JSON.stringify({
        ...result,
        instruction:
          'List transport options with mode, estimate, and external links when present. No invented URLs.',
      });
    },
    {
      name: 'search_local_transport',
      description:
        'Airport transfers, taxi, metro, bus, car rental options for a destination with links when found.',
      schema: z.object({
        destination: z.string(),
        need: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    },
  );

  const destinationGuide = tool(
    async (input) => {
      const result = await travelPlannerService.destinationGuide({
        destination: input.destination,
        interests: input.interests,
        days: input.days,
      });
      actions.push({
        type: 'TRAVEL_GUIDE',
        data: { destination: input.destination, ok: result.ok },
      });
      return JSON.stringify({
        ...result,
        instruction:
          'Present places + tips from tool only. Link sources when available. Fees are estimates.',
      });
    },
    {
      name: 'destination_guide',
      description:
        'Tourist guide: attractions, food, shopping, tips for a destination (web-backed).',
      schema: z.object({
        destination: z.string(),
        interests: z.string().optional(),
        days: z.number().int().min(1).max(14).optional(),
      }),
    },
  );

  const generateItineraryOptions = tool(
    async (input) => {
      const result = await travelPlannerService.generateItineraryOptions({
        destination: input.destination,
        days: input.days,
        budget: input.budget,
        currency: input.currency,
        interests: input.interests,
      });
      actions.push({
        type: 'TRAVEL_ITINERARIES',
        data: { destination: input.destination, ok: result.ok },
      });
      return JSON.stringify({
        ...result,
        instruction:
          'Compare plan styles (budget/balanced/premium/…). Only use returned plans. Offer to save one with save_trip_itinerary.',
      });
    },
    {
      name: 'generate_itinerary_options',
      description:
        'Generate multiple day-by-day itinerary styles for a destination (budget/balanced/premium/family/…).',
      schema: z.object({
        destination: z.string(),
        days: z.number().int().min(1).max(14).optional(),
        budget: z.number().optional(),
        currency: z.string().optional(),
        interests: z.string().optional(),
      }),
    },
  );

  const saveTripItinerary = tool(
    async (input) => {
      const dashboard = await travelTripService.saveItinerary(
        userId,
        input.trip_id,
        input.itinerary,
      );
      actions.push({
        type: 'TRIP_ITINERARY_SAVED',
        data: { tripId: input.trip_id },
      });
      return JSON.stringify({ ok: true, ...dashboard });
    },
    {
      name: 'save_trip_itinerary',
      description: 'Save a chosen itinerary plan JSON onto an existing trip.',
      schema: z.object({
        trip_id: z.string(),
        itinerary: z.any().describe('One plan object from generate_itinerary_options'),
      }),
    },
  );

  const logTripExpense = tool(
    async (input) => {
      const dashboard = await travelTripService.addExpense(userId, input.trip_id, {
        category: input.category,
        amount: input.amount,
        currency: input.currency,
        note: input.note,
      });
      actions.push({
        type: 'TRIP_EXPENSE_LOGGED',
        data: { tripId: input.trip_id, amount: input.amount },
      });
      return JSON.stringify({
        ok: true,
        ...dashboard,
        instruction: 'Confirm expense logged and show remaining budget if set.',
      });
    },
    {
      name: 'log_trip_expense',
      description:
        'Log an actual/planned expense against a trip budget (food, taxi, tickets, etc.).',
      schema: z.object({
        trip_id: z.string(),
        category: z.string(),
        amount: z.number().positive(),
        currency: z.string().optional(),
        note: z.string().optional(),
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
        external: true,
        disclaimer:
          'Estimated details only. Complete booking on the partner website — ORBIT does not process payment.',
        instruction:
          'Share the bookingUrl as a markdown link. Name the platform if known. User completes booking externally — do not collect payment.',
      });
    },
    {
      name: 'select_trip_offer',
      description:
        'Mark a hotel or flight offer as selected on a trip and return its external booking URL.',
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
    recommendDestinations,
    estimateTravelBudget,
    searchHotels,
    searchFlights,
    searchTravelDeals,
    searchLocalTransport,
    destinationGuide,
    generateItineraryOptions,
    createTrip,
    listTrips,
    getTrip,
    selectTripOffer,
    saveTripItinerary,
    logTripExpense,
    planTrip,
    createTravelReminder,
  ];
}
