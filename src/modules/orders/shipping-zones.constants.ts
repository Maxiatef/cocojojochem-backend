// US state code/name helpers, plus the admin-provided Zone 1-8 map used to
// price domestic shipping by weight (see shipping-rate-tiers module).
// Zone assignments for the 48 contiguous states come directly from the
// admin. AK/DC/territories/APO-FPO codes aren't in that list, so each is
// assigned to the zone of its real-world postal gateway/nearest neighbor,
// EXCEPT Hawaii + the Pacific island territories/APO, which the admin
// explicitly placed in their own Zone 8 (priced at a multiple of Zone 7 —
// see the seed migration and ADMIN_ZONE_8_STATES below):
//   - DC -> Zone 7 (surrounded by MD/VA, both Zone 7)
//   - AK -> Zone 4 (nearest mainland gateway state, WA)
//   - HI, GU, MP, AS, AP -> Zone 8 (Hawaii + Pacific territories/APO — admin-designated)
//   - PR, VI -> Zone 7 (nearest mainland gateway state, FL)
//   - AA (Armed Forces Americas) -> Zone 7 (USPS routes AA through Miami)
//   - AE (Armed Forces Europe/Canada/Africa/Mideast) -> Zone 7 (USPS routes AE through NY)

export const ZONE_8_STATE_CODES = ['HI', 'AS', 'GU', 'MP', 'AP'] as const;

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
  AA: 'Armed Forces Americas (AA)', AE: 'Armed Forces Europe (AE)', AP: 'Armed Forces Pacific (AP)',
  APO: 'Army/Air Force Post Office (APO)', FPO: 'Fleet Post Office (Navy) (FPO)',
  DPO: 'Diplomatic Post Office (DPO)',
};

export const ZONE_BY_STATE: Record<string, number> = {
  CA: 1,
  NV: 2, AZ: 2,
  UT: 3,
  OR: 4, WA: 4, ID: 4, MT: 4, WY: 4, CO: 4, NM: 4, AK: 4,
  TX: 5, OK: 5, KS: 5, NE: 5, SD: 5, ND: 5,
  MN: 6, IA: 6, MO: 6, AR: 6, LA: 6, WI: 6, IL: 6, MS: 6,
  AL: 7, TN: 7, MI: 7, IN: 7, KY: 7, OH: 7, GA: 7, FL: 7, SC: 7, NC: 7, VA: 7,
  WV: 7, PA: 7, MD: 7, DE: 7, NJ: 7, NY: 7, CT: 7, RI: 7, MA: 7, VT: 7, NH: 7, ME: 7,
  DC: 7, PR: 7, VI: 7, AA: 7, AE: 7,
  HI: 8, AS: 8, GU: 8, MP: 8, AP: 8,
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
