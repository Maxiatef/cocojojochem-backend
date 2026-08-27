// Ported near-verbatim from the real cocojojo.com site's
// cocojojo-backend-source/src/shipping/constants/retail-shipping-rates.ts
// and constants/international-shipping-rates.ts.
//
// US: flat rate per zone (1-8) plus a small additional-item surcharge, free
// past a subtotal threshold. International: UPS-estimate weight-band table
// per region group. Both are deterministic rate tables (no live API call),
// matching the real site's approximate-shipping approach exactly.

export const FREE_SHIPPING_THRESHOLD = 85;
export const ADDITIONAL_ITEM_RATE = 0.75;
export const ADDITIONAL_ITEM_SURCHARGE_CAP = 5;

export const US_ZONE_BASE_RATES: Record<number, number> = {
  1: 6.95,
  2: 7.95,
  3: 8.95,
  4: 9.95,
  5: 10.95,
  6: 11.95,
  7: 12.95,
  8: 13.95,
};

export const US_REMOTE_BASE_RATE = 18.95;
export const US_REMOTE_STATES = new Set(['AK', 'HI', 'PR', 'GU', 'VI', 'AS', 'MP', 'APO', 'FPO', 'DPO']);

export function calculateAdditionalItemSurcharge(totalQuantity: number): number {
  const extraUnits = Math.max(Math.trunc(totalQuantity) - 1, 0);
  const surcharge = Math.min(extraUnits * ADDITIONAL_ITEM_RATE, ADDITIONAL_ITEM_SURCHARGE_CAP);
  return roundMoney(surcharge);
}

export function roundMoney(value: number): number {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

// ---- International ----

export type InternationalShippingRateGroup =
  | 'canada' | 'europe' | 'asia' | 'australia' | 'middle_east' | 'oceania';

export const INTERNATIONAL_SHIPPING_ESTIMATE_NOTICE =
  'Estimated UPS international shipping. Duties, taxes, fuel, dimensional-weight, remote-area, residential, and peak surcharges are not included.';

export const INTERNATIONAL_WEIGHT_BANDS_LB = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50,
] as const;

export const INTERNATIONAL_SHIPPING_RATES: Record<InternationalShippingRateGroup, Record<number, number>> = {
  canada: { 1: 48, 2: 52, 3: 68, 4: 112, 5: 118, 6: 123, 7: 131, 8: 134, 9: 142, 10: 150, 15: 208, 20: 256, 25: 304, 30: 352, 35: 400, 40: 448, 45: 496, 50: 560 },
  europe: { 1: 70, 2: 80, 3: 95, 4: 205, 5: 215, 6: 225, 7: 240, 8: 250, 9: 260, 10: 270, 15: 330, 20: 390, 25: 450, 30: 510, 35: 570, 40: 630, 45: 690, 50: 800 },
  asia: { 1: 70, 2: 78, 3: 95, 4: 198, 5: 210, 6: 220, 7: 230, 8: 245, 9: 255, 10: 265, 15: 325, 20: 385, 25: 445, 30: 505, 35: 565, 40: 625, 45: 685, 50: 800 },
  australia: { 1: 75, 2: 85, 3: 105, 4: 223, 5: 235, 6: 245, 7: 255, 8: 270, 9: 280, 10: 290, 15: 360, 20: 430, 25: 500, 30: 570, 35: 640, 40: 710, 45: 780, 50: 900 },
  middle_east: { 1: 80, 2: 90, 3: 115, 4: 230, 5: 245, 6: 255, 7: 270, 8: 285, 9: 295, 10: 305, 15: 380, 20: 450, 25: 520, 30: 590, 35: 660, 40: 730, 45: 800, 50: 950 },
  oceania: { 1: 82, 2: 92, 3: 118, 4: 240, 5: 255, 6: 265, 7: 280, 8: 295, 9: 305, 10: 315, 15: 390, 20: 460, 25: 530, 30: 600, 35: 670, 40: 740, 45: 810, 50: 950 },
};

const EUROPE_COUNTRIES = new Set([
  'AL', 'AD', 'AT', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT',
  'RO', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'VA',
]);

const ASIA_COUNTRIES = new Set([
  'BD', 'BT', 'BN', 'KH', 'CN', 'HK', 'IN', 'ID', 'JP', 'KZ', 'KG', 'LA', 'MO', 'MY', 'MV', 'MN',
  'NP', 'PK', 'PH', 'SG', 'KR', 'LK', 'TW', 'TJ', 'TH', 'TL', 'TM', 'UZ', 'VN',
]);

const MIDDLE_EAST_COUNTRIES = new Set(['AE', 'BH', 'EG', 'IL', 'JO', 'KW', 'LB', 'OM', 'QA', 'SA', 'TR']);

const OCEANIA_COUNTRIES = new Set(['FJ', 'FM', 'KI', 'MH', 'NR', 'NZ', 'PG', 'PW', 'SB', 'TO', 'TV', 'VU', 'WS']);

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

export function getInternationalShippingRateGroup(country?: string): InternationalShippingRateGroup | null {
  const countryCode = normalizeCountryCode(country);
  if (countryCode === 'CA') return 'canada';
  if (countryCode === 'AU') return 'australia';
  if (EUROPE_COUNTRIES.has(countryCode)) return 'europe';
  if (ASIA_COUNTRIES.has(countryCode)) return 'asia';
  if (MIDDLE_EAST_COUNTRIES.has(countryCode)) return 'middle_east';
  if (OCEANIA_COUNTRIES.has(countryCode)) return 'oceania';
  return null;
}

export function formatRateGroupLabel(rateGroup: string): string {
  return rateGroup.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export function getInternationalWeightBand(weightLb: number): number {
  const safeWeight = Math.max(Number(weightLb) || 0, 0);
  return INTERNATIONAL_WEIGHT_BANDS_LB.find((band) => safeWeight <= band) || 50;
}

export interface InternationalParcelRate {
  parcelWeightLb: number;
  weightBandLb: number;
  rate: number;
  count: number;
  subtotal: number;
}

// Splits total weight into as many 50lb parcels as needed (the top of the
// rate table) plus one final parcel for the remainder, mirroring the real
// site's calculateInternationalParcelRates.
export function calculateInternationalParcelRates(
  totalWeightLb: number,
  group: InternationalShippingRateGroup,
): { shippingCost: number; parcels: InternationalParcelRate[] } {
  const safeWeight = Math.max(Number(totalWeightLb) || 0, 0);
  if (safeWeight <= 0) return { shippingCost: 0, parcels: [] };

  const fullParcelCount = Math.floor((safeWeight + 1e-9) / 50);
  let remainder = safeWeight - fullParcelCount * 50;
  let normalizedFullParcelCount = fullParcelCount;

  if (remainder < -1e-7) {
    normalizedFullParcelCount -= 1;
    remainder += 50;
  }
  if (Math.abs(remainder) < 1e-7) remainder = 0;

  const parcels: InternationalParcelRate[] = [];
  if (normalizedFullParcelCount > 0) {
    const rate = INTERNATIONAL_SHIPPING_RATES[group][50];
    parcels.push({
      parcelWeightLb: 50,
      weightBandLb: 50,
      rate,
      count: normalizedFullParcelCount,
      subtotal: roundMoney(rate * normalizedFullParcelCount),
    });
  }

  if (remainder > 0) {
    const weightBandLb = getInternationalWeightBand(remainder);
    const rate = INTERNATIONAL_SHIPPING_RATES[group][weightBandLb];
    parcels.push({
      parcelWeightLb: Number(remainder.toFixed(4)),
      weightBandLb,
      rate,
      count: 1,
      subtotal: roundMoney(rate),
    });
  }

  return {
    shippingCost: roundMoney(parcels.reduce((sum, parcel) => sum + parcel.subtotal, 0)),
    parcels,
  };
}
