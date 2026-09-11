/**
 * Per-product SEO analysis — the Yoast-style "what's missing and how to fix
 * it" engine, written for a wholesale ingredient catalogue.
 *
 * Deliberately NOT the `yoastseo` npm package. That engine is tuned for blog
 * prose: it wants hundreds of words, subheadings, transition words and
 * internal links, and would report "text too short, add subheadings" on every
 * ingredient page forever. It is also browser-oriented and heavy. The checks
 * below score what actually moves a product page — keyphrase placement,
 * length windows, uniqueness across the catalogue, and the chemical identity
 * fields buyers search by (INCI, CAS).
 *
 * This runs against DATABASE fields, not a crawled page, so it works on an
 * unpublished draft and needs nothing running.
 *
 * One implementation, two callers: the live check as an admin types, and the
 * score persisted on save. Sharing the function is what stops the number in
 * the form and the number in the list from ever disagreeing.
 */

export type SeoCheckStatus = 'good' | 'warning' | 'bad';

export interface SeoCheck {
  id: string;
  status: SeoCheckStatus;
  /** Shown to the admin. States the problem AND the fix, never just "bad". */
  message: string;
  /** Which group it belongs to in the UI. */
  group: 'keyphrase' | 'content' | 'metadata' | 'media';
}

export interface ProductSeoInput {
  /** Excluded from the uniqueness checks so a product never clashes with itself. */
  productId?: number | null;
  name: string;
  slug: string;
  shortDescription?: string | null;
  chemicalDescriptions?: string | null;
  inciName?: string | null;
  casNumber?: string | null;
  focusKeyphrase?: string | null;
  seoTitle?: string | null;
  metaDescription?: string | null;
  imageCount?: number;
  imagesWithAlt?: number;
  /** Titles/descriptions already used by OTHER products, for the duplicate checks. */
  existingTitles?: string[];
  existingDescriptions?: string[];
}

export interface ProductSeoResult {
  score: number;
  checks: SeoCheck[];
  /**
   * The keyphrase this product should probably target, derived from its own
   * identity fields. Offered whether or not one is already set, so the UI can
   * present it as a one-click fill rather than making the admin invent a term.
   * Null only when the product has no usable name yet.
   */
  suggestedKeyphrase: string | null;
  /** Counts by status, so the UI can show "3 problems" without recounting. */
  summary: { good: number; warning: number; bad: number };
}

// Length windows match SeoAnalyzerService.computeScore and lib/seo.ts
// clampDescription, so the site crawler and this analyser can't disagree
// about what a good title or description looks like.
const TITLE_MIN = 30;
const TITLE_MAX = 60;
const META_MIN = 120;
const META_MAX = 160;
const DESCRIPTION_MIN_WORDS = 50;
const DESCRIPTION_GOOD_WORDS = 150;

/**
 * Tidies a chemical name into something a buyer would actually type.
 *
 * Catalogue names carry qualifiers that no one searches for — grade markers
 * ("USP", "Food Grade"), pack descriptors, parenthetical synonyms. Stripping
 * them is the difference between suggesting "cetearyl alcohol" and suggesting
 * "cetearyl alcohol (nf) food grade", which would then fail its own density
 * and title checks.
 */
function cleanPhrase(value: string): string {
  return value
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(?:usp|nf|fcc|bp|ep|acs|technical|tech|food|cosmetic|pharma(?:ceutical)?|reagent)\s+grade\b/gi, ' ')
    .replace(/\b(?:usp|nf|fcc|acs)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s%.,-]/gu, ' ')
    .replace(/[\s,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * What to target, in order of how buyers search a wholesale ingredient
 * catalogue: the INCI name first (it is the regulated, unambiguous term that
 * formulators search and that appears on every label), then the product name.
 */
export function suggestKeyphrase(input: Pick<ProductSeoInput, 'inciName' | 'name'>): string | null {
  for (const candidate of [input.inciName, input.name]) {
    const phrase = cleanPhrase(candidate || '');
    // Two characters is not a searchable term; it is usually a stray code.
    if (phrase.length >= 3) return phrase;
  }
  return null;
}

function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    // Chemical names are full of punctuation — "Cetearyl Alcohol (NF)",
    // "1,3-Propanediol". Strip it so a keyphrase still matches.
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  const n = normalise(value);
  return n ? n.split(' ') : [];
}

function contains(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return normalise(haystack).includes(normalise(needle));
}

/** First paragraph = up to the first blank line, else the first 400 chars. */
function firstParagraph(text: string | null | undefined): string {
  if (!text) return '';
  const [para] = text.split(/\n\s*\n/);
  return (para || text).slice(0, 400);
}

export function analyzeProductSeo(input: ProductSeoInput): ProductSeoResult {
  const checks: SeoCheck[] = [];
  const add = (id: string, status: SeoCheckStatus, group: SeoCheck['group'], message: string) =>
    checks.push({ id, status, group, message });

  const keyphrase = (input.focusKeyphrase || '').trim();
  const effectiveTitle = (input.seoTitle || '').trim() || input.name;
  const meta = (input.metaDescription || '').trim();
  const body = [input.shortDescription, input.chemicalDescriptions].filter(Boolean).join('\n\n');
  const bodyWords = words(body).length;
  const suggestedKeyphrase = suggestKeyphrase(input);

  // ------------------------------------------------------------- keyphrase
  if (!keyphrase) {
    add(
      'keyphrase-set',
      'bad',
      'keyphrase',
      suggestedKeyphrase
        ? `No focus keyphrase set — every other keyphrase check is measured against it, so nothing below can pass. For this product use: "${suggestedKeyphrase}".`
        : 'No focus keyphrase set. Add the term buyers actually search for — usually the INCI name, e.g. "cetearyl alcohol".',
    );
  } else {
    add('keyphrase-set', 'good', 'keyphrase', `Focus keyphrase set: "${keyphrase}".`);

    add(
      'keyphrase-in-title',
      contains(effectiveTitle, keyphrase) ? 'good' : 'bad',
      'keyphrase',
      contains(effectiveTitle, keyphrase)
        ? 'Keyphrase appears in the SEO title.'
        : 'Keyphrase is missing from the SEO title — this is the single strongest signal. Put it near the start.',
    );

    add(
      'keyphrase-in-slug',
      contains(input.slug.replace(/-/g, ' '), keyphrase) ? 'good' : 'warning',
      'keyphrase',
      contains(input.slug.replace(/-/g, ' '), keyphrase)
        ? 'Keyphrase appears in the URL slug.'
        : `Keyphrase is not in the URL slug ("${input.slug}"). Changing a live slug breaks existing links, so only fix this on a new product.`,
    );

    add(
      'keyphrase-in-meta',
      contains(meta, keyphrase) ? 'good' : 'bad',
      'keyphrase',
      contains(meta, keyphrase)
        ? 'Keyphrase appears in the meta description.'
        : 'Keyphrase is missing from the meta description. Google bolds matched terms in results, which lifts click-through.',
    );

    const intro = firstParagraph(body);
    add(
      'keyphrase-in-intro',
      contains(intro, keyphrase) ? 'good' : 'warning',
      'keyphrase',
      contains(intro, keyphrase)
        ? 'Keyphrase appears in the opening paragraph.'
        : 'Keyphrase is missing from the opening paragraph. Work it into the first sentence or two.',
    );

    // Density, measured as occurrences of the phrase rather than of each word.
    if (bodyWords >= 30) {
      const hay = normalise(body);
      const needle = normalise(keyphrase);
      const occurrences = needle ? hay.split(needle).length - 1 : 0;
      const density = (occurrences * words(keyphrase).length * 100) / bodyWords;
      if (occurrences === 0) {
        add(
          'keyphrase-density',
          'bad',
          'keyphrase',
          'Keyphrase never appears in the description. Use it at least once naturally.',
        );
      } else if (occurrences === 1 && density > 3.5) {
        // A high percentage off a SINGLE mention is arithmetic, not stuffing:
        // the denominator is small because the description is short. Telling
        // someone to "cut it back" when they used the phrase once is
        // unactionable — removing it would just trip the never-appears check
        // instead. Short descriptions are already penalised by content-length,
        // so density stays out of it rather than charging twice for one fault.
        add(
          'keyphrase-density',
          'good',
          'keyphrase',
          `Keyphrase used once (${density.toFixed(1)}% density). That reads high only because the description is short — lengthen the description rather than removing the mention.`,
        );
      } else if (density > 6) {
        // Past this it is unambiguous stuffing, which search engines actively
        // penalise — so it has to cost real points, not read as a nitpick.
        add(
          'keyphrase-density',
          'bad',
          'keyphrase',
          `Keyphrase density is ${density.toFixed(1)}% (${occurrences}×) — that is keyword stuffing and can get the page demoted. Cut it back to roughly 1 use per 40 words.`,
        );
      } else if (density > 3.5) {
        add(
          'keyphrase-density',
          'warning',
          'keyphrase',
          `Keyphrase density is ${density.toFixed(1)}% (${occurrences}×) — a little heavy. Aim under 3%.`,
        );
      } else {
        add(
          'keyphrase-density',
          'good',
          'keyphrase',
          `Keyphrase used ${occurrences}× (${density.toFixed(1)}% density).`,
        );
      }
    }
  }

  // -------------------------------------------------------------- metadata
  const titleLen = effectiveTitle.length;
  if (!input.seoTitle?.trim()) {
    add(
      'title-set',
      'warning',
      'metadata',
      'No SEO title — the product name is being used. A title written for search usually converts better.',
    );
  } else if (titleLen < TITLE_MIN) {
    add(
      'title-length',
      'warning',
      'metadata',
      `SEO title is ${titleLen} characters — short. Aim for ${TITLE_MIN}–${TITLE_MAX} to use the full width of the result.`,
    );
  } else if (titleLen > TITLE_MAX) {
    add(
      'title-length',
      'warning',
      'metadata',
      `SEO title is ${titleLen} characters — Google will truncate it past about ${TITLE_MAX}.`,
    );
  } else {
    add('title-length', 'good', 'metadata', `SEO title length is ${titleLen} characters.`);
  }

  if (!meta) {
    add(
      'meta-set',
      'bad',
      'metadata',
      'No meta description. Google will invent one from the page, and it is rarely the sentence you would choose.',
    );
  } else if (meta.length < META_MIN) {
    add(
      'meta-length',
      'warning',
      'metadata',
      `Meta description is ${meta.length} characters — short. Aim for ${META_MIN}–${META_MAX}.`,
    );
  } else if (meta.length > META_MAX) {
    add(
      'meta-length',
      'warning',
      'metadata',
      `Meta description is ${meta.length} characters and will be cut off around ${META_MAX}.`,
    );
  } else {
    add('meta-length', 'good', 'metadata', `Meta description length is ${meta.length} characters.`);
  }

  // Duplicates are the quiet killer in a catalogue of near-identical products:
  // two pages competing for the same term means neither ranks.
  if (input.existingTitles?.length) {
    const clash = input.existingTitles.some((t) => normalise(t) === normalise(effectiveTitle));
    add(
      'title-unique',
      clash ? 'bad' : 'good',
      'metadata',
      clash
        ? 'Another product already uses this exact title. Duplicate titles compete with each other — make it specific to this product.'
        : 'SEO title is unique across the catalogue.',
    );
  }
  if (meta && input.existingDescriptions?.length) {
    const clash = input.existingDescriptions.some((d) => normalise(d) === normalise(meta));
    add(
      'meta-unique',
      clash ? 'bad' : 'good',
      'metadata',
      clash
        ? 'Another product already uses this exact meta description. Rewrite it for this product.'
        : 'Meta description is unique across the catalogue.',
    );
  }

  // --------------------------------------------------------------- content
  if (bodyWords === 0) {
    add(
      'content-length',
      'bad',
      'content',
      'No description at all. There is nothing for search engines to rank.',
    );
  } else if (bodyWords < DESCRIPTION_MIN_WORDS) {
    add(
      'content-length',
      'bad',
      'content',
      `Description is only ${bodyWords} words — too thin to rank. Aim for at least ${DESCRIPTION_GOOD_WORDS}.`,
    );
  } else if (bodyWords < DESCRIPTION_GOOD_WORDS) {
    add(
      'content-length',
      'warning',
      'content',
      `Description is ${bodyWords} words. ${DESCRIPTION_GOOD_WORDS}+ gives you room to cover applications and usage rates.`,
    );
  } else {
    add('content-length', 'good', 'content', `Description is ${bodyWords} words.`);
  }

  // Chemical identity: the exact strings a formulator pastes into a search box.
  add(
    'inci-set',
    input.inciName?.trim() ? 'good' : 'warning',
    'content',
    input.inciName?.trim()
      ? `INCI name set (${input.inciName.trim()}).`
      : 'No INCI name. Formulators search by INCI more than by product name.',
  );
  add(
    'cas-set',
    input.casNumber?.trim() ? 'good' : 'warning',
    'content',
    input.casNumber?.trim()
      ? `CAS number set (${input.casNumber.trim()}).`
      : 'No CAS number. Buyers use it to confirm they have the exact material.',
  );

  // ----------------------------------------------------------------- media
  const imageCount = input.imageCount ?? 0;
  const withAlt = input.imagesWithAlt ?? 0;
  if (imageCount === 0) {
    add(
      'images',
      'bad',
      'media',
      'No product images. Image search is a real source of traffic, and a listing without a photo converts badly.',
    );
  } else if (withAlt < imageCount) {
    add(
      'image-alt',
      'warning',
      'media',
      `${imageCount - withAlt} of ${imageCount} images have no alt text. Describe the material — it feeds image search and screen readers.`,
    );
  } else {
    add('image-alt', 'good', 'media', `All ${imageCount} images have alt text.`);
  }

  // ----------------------------------------------------------------- score
  // Weighted by status rather than a flat tally: a missing keyphrase should
  // cost more than a slightly-long title. Warnings count as a half-pass, so a
  // page of warnings lands mid-range rather than reading as a failure.
  const weightOf = (c: SeoCheck) =>
    c.group === 'keyphrase' || c.id === 'meta-set' || c.id === 'content-length' ? 2 : 1;

  let earned = 0;
  let possible = 0;
  for (const c of checks) {
    const w = weightOf(c);
    possible += w;
    if (c.status === 'good') earned += w;
    else if (c.status === 'warning') earned += w * 0.5;
  }

  const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);

  return {
    score,
    checks,
    suggestedKeyphrase,
    summary: {
      good: checks.filter((c) => c.status === 'good').length,
      warning: checks.filter((c) => c.status === 'warning').length,
      bad: checks.filter((c) => c.status === 'bad').length,
    },
  };
}
