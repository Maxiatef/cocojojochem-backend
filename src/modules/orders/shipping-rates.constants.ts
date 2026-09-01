// Country/domestic-vs-international helpers used by the shipping estimate.
// Domestic shipping is priced from the admin-editable Zone 1-7 rate tables
// (ShippingRateTiersService) keyed by state-to-zone mapping (see
// shipping-zones.constants.ts) — this file only keeps the pieces still
// needed: the free-shipping default, money rounding, and US-vs-international
// country detection.

export const FREE_SHIPPING_THRESHOLD = 85;

export function roundMoney(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  canada: 'CA', australia: 'AU', 'united kingdom': 'GB', 'great britain': 'GB', england: 'GB', uk: 'GB',
  'united states': 'US', 'united states of america': 'US', usa: 'US', us: 'US',
  'united arab emirates': 'AE', 'saudi arabia': 'SA', 'south korea': 'KR', 'new zealand': 'NZ',
  'south africa': 'ZA', 'czech republic': 'CZ', 'north macedonia': 'MK', 'sri lanka': 'LK',
  germany: 'DE', france: 'FR', italy: 'IT', spain: 'ES', netherlands: 'NL', belgium: 'BE',
  switzerland: 'CH', austria: 'AT', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI',
  ireland: 'IE', portugal: 'PT', greece: 'GR', poland: 'PL', japan: 'JP', singapore: 'SG', israel: 'IL',
  mexico: 'MX',
};

export function normalizeCountryCode(country?: string): string {
  const trimmed = (country || '').trim();
  if (!trimmed) return '';
  const alias = COUNTRY_NAME_TO_CODE[trimmed.toLowerCase()];
  if (alias) return alias;
  const upper = trimmed.toUpperCase();
  return upper === 'UK' ? 'GB' : upper;
}

export function isUnitedStates(country?: string): boolean {
  return normalizeCountryCode(country) === 'US';
}
