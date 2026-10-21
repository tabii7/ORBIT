/**
 * International hotel booking platforms (OTAs) preferred by ORBIT.
 * Links are always external — user books on the partner site.
 */

export const HOTEL_OTA_DOMAINS = [
  'booking.com',
  'agoda.com',
  'hotels.com',
  'expedia.com',
  'kayak.com',
] as const;

/** Secondary / meta — allowed but ranked below major OTAs */
export const HOTEL_SECONDARY_DOMAINS = [
  'tripadvisor.com',
  'trivago.com',
  'hotelscombined.com',
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  'booking.com': 'Booking.com',
  'agoda.com': 'Agoda',
  'hotels.com': 'Hotels.com',
  'expedia.com': 'Expedia',
  'kayak.com': 'Kayak',
  'tripadvisor.com': 'Tripadvisor',
  'trivago.com': 'Trivago',
  'hotelscombined.com': 'HotelsCombined',
};

export type HotelProviderInfo = {
  domain: string | null;
  provider: string;
  isMajorOta: boolean;
  isKnownHotelSite: boolean;
};

export function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function matchKnownDomain(
  hostname: string | null,
  domains: readonly string[],
): string | null {
  if (!hostname) return null;
  return (
    domains.find(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    ) ?? null
  );
}

export function resolveHotelProvider(url: string): HotelProviderInfo {
  const hostname = extractHostname(url);
  const major = matchKnownDomain(hostname, HOTEL_OTA_DOMAINS);
  if (major) {
    return {
      domain: major,
      provider: PROVIDER_LABELS[major] || major,
      isMajorOta: true,
      isKnownHotelSite: true,
    };
  }
  const secondary = matchKnownDomain(hostname, HOTEL_SECONDARY_DOMAINS);
  if (secondary) {
    return {
      domain: secondary,
      provider: PROVIDER_LABELS[secondary] || secondary,
      isMajorOta: false,
      isKnownHotelSite: true,
    };
  }
  return {
    domain: hostname,
    provider: hostname || 'External',
    isMajorOta: false,
    isKnownHotelSite: false,
  };
}

export function hotelOtaSearchHint(): string {
  return (
    `Prefer listing/search pages on: ${HOTEL_OTA_DOMAINS.join(', ')}. ` +
    'Include a mix of these international platforms when available. ' +
    'Prices are estimates only — user completes booking on the external site.'
  );
}
