import { Injectable } from '@nestjs/common';
import { TravelOfferKind } from '@prisma/client';
import { TravelPreferencesService } from './travel-preferences.service';
import { TravelSearchHit } from './travel-search.service';
import { TravelTripService } from './travel-trip.service';

export type NormalizedTravelOption = {
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
  score: number;
  reasons: string[];
};

@Injectable()
export class TravelCompareService {
  constructor(
    private readonly travelPreferencesService: TravelPreferencesService,
    private readonly travelTripService: TravelTripService,
  ) {}

  extractSource(url: string): string | undefined {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return undefined;
    }
  }

  parseStructured(hit: TravelSearchHit & Record<string, unknown>) {
    const priceRaw = hit.price ?? (hit as { estimatedPrice?: number }).estimatedPrice;
    const price =
      typeof priceRaw === 'number'
        ? priceRaw
        : typeof priceRaw === 'string'
          ? Number(priceRaw)
          : this.extractPrice(
              String(hit.content || (hit as { snippet?: string }).snippet || ''),
            );

    const text = String(
      hit.content || (hit as { snippet?: string }).snippet || '',
    );

    return {
      title: hit.title,
      bookingUrl: hit.url || (hit as { bookingUrl?: string }).bookingUrl || '',
      snippet: text,
      source: this.extractSource(
        hit.url || (hit as { bookingUrl?: string }).bookingUrl || '',
      ),
      price: Number.isFinite(price as number) ? (price as number) : undefined,
      currency:
        (hit as { currency?: string }).currency ||
        this.extractCurrency(text) ||
        undefined,
      stars:
        typeof hit.stars === 'number'
          ? hit.stars
          : this.extractStars(hit.title + ' ' + text),
      airline: (hit as { airline?: string }).airline,
      durationMinutes:
        typeof (hit as { durationMinutes?: number }).durationMinutes ===
        'number'
          ? (hit as { durationMinutes?: number }).durationMinutes
          : this.extractDurationMinutes(text),
      stops:
        typeof (hit as { stops?: number }).stops === 'number'
          ? (hit as { stops?: number }).stops
          : this.extractStops(text),
    };
  }

  scoreHotel(
    option: Omit<NormalizedTravelOption, 'score' | 'reasons' | 'kind'>,
    prefs: {
      maxHotelBudget?: number | null;
      preferredHotelStars?: number | null;
      preferredCurrency?: string;
    },
  ): { score: number; reasons: string[] } {
    let score = 50;
    const reasons: string[] = [];

    if (option.bookingUrl) {
      score += 10;
      reasons.push('Has booking link');
    }
    if (prefs.maxHotelBudget != null && option.price != null) {
      if (option.price <= prefs.maxHotelBudget) {
        score += 25;
        reasons.push(`Within hotel budget (${prefs.maxHotelBudget})`);
      } else {
        score -= 20;
        reasons.push('Over hotel budget');
      }
    }
    if (prefs.preferredHotelStars != null && option.stars != null) {
      if (option.stars >= prefs.preferredHotelStars) {
        score += 15;
        reasons.push(`Matches ${prefs.preferredHotelStars}+ stars`);
      } else {
        score -= 5;
        reasons.push('Below preferred stars');
      }
    }
    if (option.source) {
      score += 5;
      reasons.push(`Source: ${option.source}`);
    }

    return { score: Math.max(0, Math.min(100, score)), reasons };
  }

  scoreFlight(
    option: Omit<NormalizedTravelOption, 'score' | 'reasons' | 'kind'>,
    prefs: {
      maxFlightBudget?: number | null;
      preferredAirlines?: string[];
      preferredCurrency?: string;
    },
  ): { score: number; reasons: string[] } {
    let score = 50;
    const reasons: string[] = [];

    if (option.bookingUrl) {
      score += 10;
      reasons.push('Has booking link');
    }
    if (prefs.maxFlightBudget != null && option.price != null) {
      if (option.price <= prefs.maxFlightBudget) {
        score += 25;
        reasons.push(`Within flight budget (${prefs.maxFlightBudget})`);
      } else {
        score -= 20;
        reasons.push('Over flight budget');
      }
    }
    if (prefs.preferredAirlines?.length && option.airline) {
      const match = prefs.preferredAirlines.some((a) =>
        option.airline!.toLowerCase().includes(a.toLowerCase()),
      );
      if (match) {
        score += 15;
        reasons.push(`Preferred airline: ${option.airline}`);
      }
    }
    if (option.stops === 0) {
      score += 10;
      reasons.push('Direct flight');
    } else if (option.stops != null && option.stops > 0) {
      score -= option.stops * 5;
      reasons.push(`${option.stops} stop(s)`);
    }
    if (option.durationMinutes != null && option.durationMinutes < 360) {
      score += 5;
      reasons.push('Reasonable duration');
    }

    return { score: Math.max(0, Math.min(100, score)), reasons };
  }

  async compareAndRecommend(params: {
    userId: string;
    kind: TravelOfferKind;
    hits: Array<TravelSearchHit & Record<string, unknown>>;
    tripId?: string;
    persist?: boolean;
  }) {
    const prefs = await this.travelPreferencesService.get(params.userId);
    const options: NormalizedTravelOption[] = params.hits
      .map((hit) => {
        const base = this.parseStructured(hit);
        if (!base.bookingUrl || !base.title) return null;
        const scored =
          params.kind === TravelOfferKind.HOTEL
            ? this.scoreHotel(base, prefs)
            : this.scoreFlight(base, {
                maxFlightBudget: prefs.maxFlightBudget,
                preferredAirlines: prefs.preferredAirlines,
                preferredCurrency: prefs.preferredCurrency,
              });
        return {
          kind: params.kind,
          ...base,
          currency: base.currency || prefs.preferredCurrency,
          score: scored.score,
          reasons: scored.reasons,
        } as NormalizedTravelOption;
      })
      .filter((x): x is NormalizedTravelOption => Boolean(x))
      .sort((a, b) => b.score - a.score);

    if (options.length) {
      options[0].reasons = [`Best match`, ...options[0].reasons];
    }

    let saved: Awaited<ReturnType<TravelTripService['saveOffers']>> = [];
    if (params.persist !== false && options.length) {
      saved = await this.travelTripService.saveOffers(
        params.userId,
        options.map((o, i) => ({
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
          isRecommended: i === 0,
          tripId: params.tripId,
        })),
      );
    }

    return {
      kind: params.kind,
      total: options.length,
      bestMatch: options[0] ?? null,
      comparison: options.map((o, i) => ({
        rank: i + 1,
        ...o,
        offerId: saved[i]?.id,
      })),
      recommendation: options[0]
        ? {
            title: options[0].title,
            bookingUrl: options[0].bookingUrl,
            score: options[0].score,
            why: options[0].reasons,
            offerId: saved[0]?.id,
          }
        : null,
    };
  }

  private extractPrice(text: string): number | undefined {
    const m = text.match(
      /(?:AED|USD|EUR|GBP|PKR)?\s?(\d{2,3}(?:,\d{3})*(?:\.\d{1,2})?)/i,
    );
    if (!m) return undefined;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }

  private extractCurrency(text: string): string | undefined {
    const m = text.match(/\b(AED|USD|EUR|GBP|PKR)\b/i);
    return m?.[1]?.toUpperCase();
  }

  private extractStars(text: string): number | undefined {
    const m = text.match(/(\d)\s*[- ]?\s*star/i);
    if (!m) return undefined;
    const n = Number(m[1]);
    return n >= 1 && n <= 5 ? n : undefined;
  }

  private extractDurationMinutes(text: string): number | undefined {
    const hm = text.match(/(\d+)\s*h(?:ours?)?\s*(\d+)?\s*m?/i);
    if (hm) {
      return Number(hm[1]) * 60 + Number(hm[2] || 0);
    }
    return undefined;
  }

  private extractStops(text: string): number | undefined {
    if (/non[-\s]?stop|direct/i.test(text)) return 0;
    const m = text.match(/(\d+)\s*stop/i);
    if (m) return Number(m[1]);
    return undefined;
  }
}
