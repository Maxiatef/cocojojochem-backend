/**
 * `yoastseo` declares a `types` entry in its package.json that points at a
 * directory it never publishes, so TypeScript resolves the import to nothing.
 *
 * Only the narrow surface the page analyser touches statically is declared
 * here; the assessors themselves are pulled in through `require()` inside
 * `loadEngine()`, so they stay out of the module graph until a crawl runs.
 */
declare module 'yoastseo' {
  export const interpreters: {
    /** Yoast's rating bands: <=4 bad, 5-7 ok, >7 good, 0 feedback, -1 error. */
    scoreToRating(score: number): 'good' | 'ok' | 'bad' | 'feedback' | 'error' | '';
  };
}
