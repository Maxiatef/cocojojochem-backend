/**
 * Runs the real Yoast engine over a crawled storefront page.
 *
 * WHY NO jsdom
 * ------------
 * Yoast's `titleWidth` assessment is the one piece that needs a browser: it
 * measures the title's rendered pixel width through `document`. But that width
 * is an INPUT to the Paper, not something Yoast measures itself — so supplying
 * it directly (see `approximateTitleWidth`) keeps every assessment running with
 * no DOM at all. Verified: all 16 SEO and 6 readability assessments produce
 * results under plain Node with `typeof document === 'undefined'`.
 *
 * WHEN KEYPHRASE CHECKS ARE EXCLUDED
 * ----------------------------------
 * Nine of Yoast's sixteen SEO assessments judge the page against a focus
 * keyphrase. A page that has none gets placeholder feedback from all nine, and
 * two of them return large negative SENTINEL scores (-999, -50) meaning
 * "cannot run" — which Yoast's own averaging folds in as if they were real
 * marks, collapsing the score to zero.
 *
 * So while a page has no keyphrase they are excluded, from the score and from
 * what is shown: scoring a page on nine checks it cannot answer is not a
 * strict grade, it is a broken one. Once a keyphrase is saved against the
 * path (SeoPage.focusKeyphrase) they all run, and they become the most useful
 * checks here — the only ones that distinguish a page from every other page
 * sharing its layout.
 */

import { interpreters } from 'yoastseo';

/** Yoast's own rating bands: <=4 bad, 5-7 ok, >7 good, 0 feedback. */
export type PageYoastRating = 'good' | 'ok' | 'bad' | 'feedback' | 'error' | '';

export interface PageYoastCheck {
  id: string;
  /** Yoast's raw 0-9 mark for this assessment. */
  score: number;
  rating: PageYoastRating;
  /** Feedback copy, with Yoast's links to yoast.com stripped. */
  text: string;
  group: 'seo' | 'readability';
}

export interface PageYoastResult {
  /** 0-100, computed from the applicable checks only. */
  seoScore: number;
  readabilityScore: number;
  seoProblems: number;
  readabilityProblems: number;
  /** How many assessments were skipped as inapplicable — shown as a footnote. */
  skippedChecks: number;
  checks: PageYoastCheck[];
}

interface PageYoastInput {
  html: string;
  title?: string;
  metaDescription?: string;
  path?: string;
  /**
   * The page's focus keyphrase, from its SeoPage override. When set, the nine
   * keyphrase assessments become answerable and are scored; when absent they
   * are excluded (see the note at the top of this file).
   */
  focusKeyphrase?: string;
}

/**
 * Assessments that depend on a focus keyphrase. A crawled page has none, so
 * each returns either a sentinel or a "please add a keyphrase" placeholder.
 */
const KEYPHRASE_CHECKS = new Set([
  'introductionKeyword',
  'keyphraseLength',
  'keyphraseDensity',
  'metaDescriptionKeyword',
  'subheadingsKeyword',
  'imageKeyphrase',
  'keyphraseInSEOTitle',
  'slugKeyword',
  'textCompetingLinks',
]);

/** Yoast's own per-assessment ceiling; the denominator when averaging. */
const MAX_ASSESSMENT_SCORE = 9;

/**
 * Google truncates titles by rendered width, not character count, and Yoast's
 * threshold is ~600px. Without a browser we approximate at 9px per character
 * — close enough to answer "will this be cut off?", which is all the check
 * asks. Stated plainly rather than presented as a real measurement.
 */
function approximateTitleWidth(title: string): number {
  return title.length * 9;
}

/** Yoast's copy carries anchor tags to yoast.com; strip them. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Loaded lazily. The engine pulls in language data for every locale it
 * supports, and a crawl is the only thing that ever needs it — requiring it at
 * module load would put that cost on every boot of the API.
 */
function loadEngine() {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const yoast = require('yoastseo');
  const Researcher =
    require('yoastseo/build/languageProcessing/languages/en/Researcher').default;
  /* eslint-enable @typescript-eslint/no-var-requires */
  return {
    Paper: yoast.Paper,
    SeoAssessor: yoast.SeoAssessor,
    ContentAssessor: yoast.ContentAssessor,
    Researcher,
  };
}

const EMPTY: PageYoastResult = {
  seoScore: 0,
  readabilityScore: 0,
  seoProblems: 0,
  readabilityProblems: 0,
  skippedChecks: 0,
  checks: [],
};

export function analyzePageWithYoast(input: PageYoastInput): PageYoastResult {
  try {
    const { Paper, SeoAssessor, ContentAssessor, Researcher } = loadEngine();

    const title = input.title || '';
    const keyphrase = (input.focusKeyphrase || '').trim();

    const paper = new Paper(input.html, {
      keyword: keyphrase,
      title,
      titleWidth: approximateTitleWidth(title),
      description: input.metaDescription || '',
      slug: input.path || '',
      locale: 'en_US',
    });

    // One researcher per paper: it caches research keyed to the paper it was
    // built with, so sharing one across pages would return the first page's
    // answers for every page after it.
    const researcher = new Researcher(paper);

    let skipped = 0;

    const run = (assessor: any, group: 'seo' | 'readability') => {
      assessor.assess(paper);

      const applicable: PageYoastCheck[] = [];
      for (const result of assessor.getValidResults()) {
        // Excluded only while the page has no keyphrase to judge them against.
        // Once one is set they are the most informative checks here — they are
        // the only ones that distinguish a page from every other page sharing
        // its layout.
        if (!keyphrase && group === 'seo' && KEYPHRASE_CHECKS.has(result._identifier)) {
          skipped++;
          continue;
        }
        applicable.push({
          id: result._identifier,
          score: result.score,
          // Yoast's own interpreter, not a hand-rolled threshold — its bands
          // are what the wording of each message assumes.
          rating: interpreters.scoreToRating(result.score) as PageYoastRating,
          text: plainText(result.text),
          group,
        });
      }

      // Averaged over the applicable checks only. Yoast's own
      // calculateOverallScore() would include the excluded ones.
      const total = applicable.reduce((sum, c) => sum + Math.max(0, c.score), 0);
      const score = applicable.length
        ? Math.round((total / (applicable.length * MAX_ASSESSMENT_SCORE)) * 100)
        : 0;

      return {
        score: Math.max(0, Math.min(100, score)),
        problems: applicable.filter((c) => c.rating === 'bad').length,
        checks: applicable,
      };
    };

    const seo = run(new SeoAssessor(researcher, {}), 'seo');
    const readability = run(new ContentAssessor(researcher, {}), 'readability');

    return {
      seoScore: seo.score,
      readabilityScore: readability.score,
      seoProblems: seo.problems,
      readabilityProblems: readability.problems,
      skippedChecks: skipped,
      // Worst first inside each group — the panel reads as a to-do list.
      checks: [...seo.checks, ...readability.checks].sort((a, b) =>
        a.group === b.group ? a.score - b.score : a.group === 'seo' ? -1 : 1,
      ),
    };
  } catch (err) {
    // A crawl must survive a broken page. Returning empty means the row still
    // saves with its other metrics and the failure is visible in the log.
    console.error(
      `Yoast page analysis failed for "${input.path}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return EMPTY;
  }
}
