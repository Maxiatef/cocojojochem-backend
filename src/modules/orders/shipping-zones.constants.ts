// Ported near-verbatim from the real cocojojo.com site's
// cocojojo-backend-source/src/shipping/constants/shipping-zones.ts.
// US state -> shipping zone (1-8) mapping used for zone-based flat rates.
// States/territories mapped to `null` are explicitly non-shippable — mirror
// that honestly rather than silently accepting an order there.

export const US_STATE_ZONES: Record<string, number | null> = {
  // Zone 1 - West Coast
  CA: 1,
  // Zone 2 - Southwest
  AZ: 2,
  NV: 2,
  // Zone 3 - Pacific Northwest
  OR: 3,
  WA: 3,
  UT: 3,
  // Zone 4 - Mountain/Southwest
  ID: 4,
  NM: 4,
  // Zone 5 - Mountain/Central
  CO: 5,
  MT: 5,
  WY: 5,
  // Zone 6 - Central/South Central
  AR: 6,
  IA: 6,
  KS: 6,
  NE: 6,
  OK: 6,
  SD: 6,
  TX: 6,
  // Zone 7 - Midwest/South
  AL: 7,
  IL: 7,
  IN: 7,
  KY: 7,
  LA: 7,
  MI: 7,
  MN: 7,
  MS: 7,
  MO: 7,
  ND: 7,
  OH: 7,
  TN: 7,
  WI: 7,
  // Zone 8 - East Coast/Northeast
  CT: 8,
  DE: 8,
  FL: 8,
  GA: 8,
  ME: 8,
  MD: 8,
  MA: 8,
  NH: 8,
  NJ: 8,
  NY: 8,
  NC: 8,
  PA: 8,
  RI: 8,
  SC: 8,
  VT: 8,
  VA: 8,
  WV: 8,
  DC: 8,

  // Non-shipping states/territories
  AK: null,
  HI: null,
  PR: null,
  GU: null,
  VI: null,
  AS: null,
  MP: null,
  APO: null,
  FPO: null,
  DPO: null,
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
  APO: 'Army/Air Force Post Office (APO)', FPO: 'Fleet Post Office (Navy) (FPO)',
  DPO: 'Diplomatic Post Office (DPO)',
};

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

export function getZoneForState(stateCode: string): number | null {
  const normalizedStateCode = normalizeStateCode(stateCode);
  return US_STATE_ZONES[normalizedStateCode] || null;
}

export function getStateName(stateCode: string): string {
  const normalizedStateCode = normalizeStateCode(stateCode);
  return US_STATE_NAMES[normalizedStateCode] || stateCode;
}

export function canShipToState(stateCode: string): boolean {
  const normalizedStateCode = normalizeStateCode(stateCode);
  return US_STATE_ZONES[normalizedStateCode] !== undefined && US_STATE_ZONES[normalizedStateCode] !== null;
}
