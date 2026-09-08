// US state code/name helpers, plus the admin-provided Zone 1-8 map used to
// price domestic shipping by weight (see shipping-rate-tiers module).
// Zone 1-7 is an exact, explicit admin-provided list of the 41 states named
// below. EVERY other US state/code — including Alaska, Hawaii, DC, and the
// territories — falls into Zone 8, which is never auto-priced at checkout
// (see ZONE_8_CARRIER_NOTICE in orders.service.ts). Zone 8 is a catch-all,
// not a curated list, so it's derived below rather than hand-enumerated.
//
// The military/diplomatic mail codes are NOT in this map at all — see
// UNSUPPORTED_MILITARY_CODES below for why.

const ZONE_1_7_STATES: Record<string, number> = {
  CA: 1,
  NV: 2, AZ: 2,
  UT: 3,
  OR: 4, WA: 4, ID: 4, MT: 4, WY: 4, CO: 4, NM: 4,
  TX: 5, OK: 5, KS: 5, NE: 5, SD: 5, ND: 5,
  MN: 6, IA: 6, MO: 6, AR: 6, LA: 6, WI: 6, IL: 6, MS: 6,
  AL: 7, TN: 7, MI: 7, IN: 7, KY: 7, OH: 7, GA: 7, FL: 7, SC: 7, NC: 7, VA: 7,
  WV: 7, PA: 7, MD: 7, DE: 7, NJ: 7, NY: 7, CT: 7, RI: 7, MA: 7, VT: 7, NH: 7, ME: 7,
};

export const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia', PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands',
  AS: 'American Samoa', MP: 'Northern Mariana Islands',
};

// Deliberately NOT shippable destinations, and deliberately absent from
// US_STATE_NAMES above: the military/diplomatic mail codes AA (Armed Forces
// Americas), AE (Europe), AP (Pacific) and the post-office designations
// APO/FPO/DPO.
//
// Only USPS can deliver to them (UPS/FedEx cannot at all), parcels are capped
// around 70 lb, and military mail restricts or prohibits much of what we sell
// — so nothing in the weight or drum tables could actually be fulfilled to
// one of these addresses. They are omitted from the state list rather than
// mapped to a zone, so they never appear in the checkout dropdown.
//
// Kept here as a named list purely so the unrecognised-destination path in
// OrdersService.getShippingEstimate can be reasoned about: any code not in
// US_STATE_NAMES resolves to no zone and is quoted manually rather than
// silently falling back to a flat amount.
export const UNSUPPORTED_MILITARY_CODES = ['AA', 'AE', 'AP', 'APO', 'FPO', 'DPO'] as const;

export const ZONE_BY_STATE: Record<string, number> = Object.keys(US_STATE_NAMES).reduce(
  (acc, code) => ({ ...acc, [code]: ZONE_1_7_STATES[code] ?? 8 }),
  {} as Record<string, number>,
);

const US_STATE_CODES_BY_NAME: Record<string, string> = Object.entries(US_STATE_NAMES).reduce(
  (acc, [code, name]) => ({ ...acc, [name.toLowerCase()]: code }),
  {} as Record<string, string>,
);

export function normalizeStateCode(stateCodeOrName: string): string {
  const normalized = (stateCodeOrName || '').trim();
  if (!normalized) return '';
  const upper = normalized.toUpperCase();
  if (US_STATE_NAMES[upper]) return upper;
  return US_STATE_CODES_BY_NAME[normalized.toLowerCase()] || upper;
}

export function getStateName(stateCode: string): string {
  const normalizedStateCode = normalizeStateCode(stateCode);
  return US_STATE_NAMES[normalizedStateCode] || stateCode;
}

// Returns null for a state code with no zone mapping (never fabricates a
// zone) — callers should fall back to the admin-set default shipping amount.
export function getZoneForState(stateCode: string): number | null {
  const normalized = normalizeStateCode(stateCode);
  return ZONE_BY_STATE[normalized] ?? null;
}
