import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { SeoMetric, SeoPage, Product, ProductSeo, Category, ProductVisibility } from '../../entities';
import { analyzePageWithYoast } from './page-yoast.rules';
import { SeoIssue, SeoIssueSeverity, SeoIssueType } from '../../entities/SeoIssue';
import {
  analyzeProductSeo,
  ProductSeoInput,
  ProductSeoResult,
} from './product-seo.rules';

// Mirrors the static routes in frontend `src/app/sitemap.ts` — every page
// Google is actually told about, minus the pages `robots.ts` disallows
// (/admin, /account, /cart, /checkout). Keep the two lists in sync: a page
// added to one belongs in the other.
const KNOWN_STATIC_PATHS = [
  '/',
  '/products',
  '/categories',
  '/functions',
  '/about',
  '/contact',
  '/quote-request',
  '/legal/terms-of-service',
  '/legal/privacy-policy',
];

/**
 * The two pages that exist once as a template but many times as URLs.
 *
 * These are stored under the template path, not the sampled one. Listing
 * every product by slug looked thorough and was actually worse: the table
 * churned on every rename, publish and delete, 19 rows repeated what is one
 * shared layout, and the crawl grew linearly with the catalogue. One sample
 * answers the question this crawl is for — "does the product page template
 * emit a good title, meta and heading structure" — and keeps answering it
 * when the catalogue changes underneath.
 *
 * Per-product SEO is not lost by this: it is scored per record by
 * `analyzeProduct()` and shown in the product editor, which is the right
 * place for it because it works on an unsaved draft.
 *
 * The sample is the alphabetically first published record, so the same page
 * is measured run after run and the score means something when compared with
 * last week's. The row's stored `title` is the sampled page's real title, so
 * which record produced the numbers stays visible.
 */
const PRODUCT_TEMPLATE_PATH = '/products/[slug]';
const CATEGORY_TEMPLATE_PATH = '/categories/[slug]';

// A safety net against a runaway crawl, not a real ceiling. The list is
// bounded by design now, but an admin can register arbitrary extra paths.
const MAX_PATHS = 500;
const FETCH_DELAY_MS = 300;

/**
 * One page to crawl: the URL actually fetched, and the path it is filed
 * under. They differ only for the templates above.
 */
interface CrawlTarget {
  path: string;
  url: string;
}

interface ExtractedPageData {
  /**
   * Body HTML with `script, style, nav, header, footer` already stripped —
   * what gets handed to Yoast. Not the raw page: Yoast's own tooling only
   * ever sees a WordPress post's content area, never a site's header or nav,
   * so its "first paragraph", "subheading" and link/image research all
   * assume they're reading article content. Handed the full page instead,
   * they read whatever text comes first in the DOM — on every page here,
   * that was the persistent top utility bar ("Your ingredient partner. From
   * concept to scale."), not the page's own intro, and it was failing
   * "keyphrase in introduction" no matter what the real intro paragraph
   * said. `wordCount` below was already computed this way; this just makes
   * the HTML handed to Yoast agree with it.
   */
  contentHtml?: string;
  title: string | null;
  metaDescription: string | null;
  h1Tag: string | null;
  h1Count: number;
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  imageCount: number;
  imagesWithAltText: number;
  pageLoadTimeMs: number;
}

/**
 * Per-product analysis. Separate from the crawler above on purpose: that one
 * fetches live URLs and scores whole pages, this reads database fields and
 * scores one product — so it works on an unpublished draft with nothing
 * running.
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class SeoAnalyzerService {
  private readonly logger = new Logger('SeoAnalyzer');
  private readonly baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductSeo)
    private readonly productSeoRepo: Repository<ProductSeo>,
    @InjectRepository(SeoMetric)
    private readonly seoMetricRepo: Repository<SeoMetric>,
    @InjectRepository(SeoIssue)
    private readonly seoIssueRepo: Repository<SeoIssue>,
    @InjectRepository(SeoPage)
    private readonly seoPageRepo: Repository<SeoPage>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  /**
   * Every URL the crawler should score: the static marketing pages, plus one
   * path per published product and per category that actually has published
   * products, plus anything an admin has registered by hand in `seo_pages`
   * (a landing page with no code route of its own).
   *
   * Sourced the same way `sitemap.ts` sources them on the frontend — the
   * public visibility gate (`isPublished`, not scheduled for the future,
   * `visibility = PUBLIC`) and "category has at least one published
   * product" — so this list and what Google is actually told about never
   * drift apart. Previously this was four hard-coded routes: real product
   * and category pages were never crawled at all, which is why nothing under
   * /products/[slug] or /categories/[slug] ever showed up here.
   */
  async getPathsToCrawl(): Promise<CrawlTarget[]> {
    const [seoPages, sampleProduct, categories] = await Promise.all([
      this.seoPageRepo.find(),
      // Alphabetically first published product — the same one every run, so
      // this week's score is comparable with last week's.
      this.productsRepo
        .createQueryBuilder('product')
        .select(['product.slug'])
        .where('product.isPublished = true')
        .andWhere('(product.scheduledPublishAt IS NULL OR product.scheduledPublishAt <= NOW())')
        .andWhere('product.visibility = :visibility', { visibility: ProductVisibility.PUBLIC })
        .orderBy('product.name', 'ASC')
        .getOne(),
      this.categoryRepo
        .createQueryBuilder('category')
        .loadRelationCountAndMap('category.productCount', 'category.products', 'product', (qb) =>
          qb.andWhere('product.isPublished = true'),
        )
        .orderBy('category.name', 'ASC')
        .getMany(),
    ]);

    // A category with no published products renders an empty listing, which
    // would score the empty state rather than the template.
    const sampleCategory = categories.find(
      (c) => ((c as Category & { productCount: number }).productCount ?? 0) > 0,
    );

    const targets: CrawlTarget[] = KNOWN_STATIC_PATHS.map((path) => ({ path, url: path }));

    if (sampleProduct) {
      targets.push({ path: PRODUCT_TEMPLATE_PATH, url: `/products/${sampleProduct.slug}` });
    }
    if (sampleCategory) {
      targets.push({ path: CATEGORY_TEMPLATE_PATH, url: `/categories/${sampleCategory.slug}` });
    }

    // Anything an admin registered by hand, minus duplicates of the above.
    const seen = new Set(targets.map((t) => t.path));
    for (const page of seoPages) {
      if (seen.has(page.path)) continue;
      seen.add(page.path);
      targets.push({ path: page.path, url: page.path });
    }

    return targets.slice(0, MAX_PATHS);
  }

  private async fetchAndExtract(path: string): Promise<ExtractedPageData> {
    const url = `${this.baseUrl}${path}`;
    const start = Date.now();
    const response = await axios.get(url, {
      timeout: 15000,
      headers: { 'User-Agent': 'CocojojochemSeoAnalyzer/1.0' },
    });
    const pageLoadTimeMs = Date.now() - start;

    const $ = cheerio.load(response.data);

    const title = $('title').first().text().trim() || null;
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;

    const h1s = $('h1');
    const h1Count = h1s.length;
    const h1Tag = h1Count > 0 ? h1s.first().text().trim() : null;

    const bodyClone = $('body').clone();
    bodyClone.find('script, style, nav, header, footer').remove();
    const bodyText = bodyClone.text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText ? bodyText.split(' ').filter(Boolean).length : 0;

    const internalLinks = $('a[href^="/"]').length;
    const externalLinks = $('a[href^="http"]').length;

    // Decorative images are SUPPOSED to carry alt="" — the empty attribute is
    // what tells a screen reader to skip them. Counting them as failures pushes
    // authors to describe background art and to repeat a control's own label,
    // both of which a screen reader then announces. They are excluded from the
    // count rather than scored against it.
    const contentImages = $('img').filter((_, el) => {
      const $el = $(el);
      const role = ($el.attr('role') || '').toLowerCase();
      if (role === 'presentation' || role === 'none') return false;
      if ($el.attr('aria-hidden') === 'true') return false;
      // Hidden by an ancestor: a decorative layer stack marks the wrapper, not
      // every image inside it.
      if ($el.closest('[aria-hidden="true"]').length > 0) return false;
      // Inside a control that already has an accessible name, alt text is read
      // in addition to that name, not instead of it.
      if ($el.closest('button[aria-label], a[aria-label]').length > 0) return false;
      return true;
    });
    const imageCount = contentImages.length;
    let imagesWithAltText = 0;
    contentImages.each((_, el) => {
      const alt = $(el).attr('alt');
      if (alt && alt.trim().length > 0) imagesWithAltText++;
    });

    return {
      contentHtml: bodyClone.html() || '',
      title,
      metaDescription,
      h1Tag,
      h1Count,
      wordCount,
      internalLinks,
      externalLinks,
      imageCount,
      imagesWithAltText,
      pageLoadTimeMs,
    };
  }

  private computeScore(data: ExtractedPageData): number {
    let score = 10; // flat base

    if (data.title) {
      score += 15;
      const len = data.title.length;
      if (len >= 30 && len <= 60) score += 5;
    }

    if (data.metaDescription) {
      score += 15;
      const len = data.metaDescription.length;
      if (len >= 120 && len <= 160) score += 5;
    }

    if (data.h1Tag) {
      score += 10;
      const len = data.h1Tag.length;
      if (len >= 20 && len <= 70) score += 5;
    }

    if (data.wordCount >= 600) score += 20;
    else if (data.wordCount >= 300) score += 15;
    else if (data.wordCount >= 150) score += 10;

    if (data.imageCount > 0) {
      score += 10;
      if (data.imagesWithAltText === data.imageCount) score += 5;
    }

    return Math.min(100, score);
  }

  private detectIssues(path: string, data: ExtractedPageData): Array<Pick<SeoIssue, 'issueType' | 'severity' | 'description'>> {
    const issues: Array<Pick<SeoIssue, 'issueType' | 'severity' | 'description'>> = [];

    if (!data.title) {
      issues.push({
        issueType: SeoIssueType.MISSING_TITLE,
        severity: SeoIssueSeverity.CRITICAL,
        description: `Page "${path}" is missing a <title> tag.`,
      });
    }

    if (!data.metaDescription) {
      issues.push({
        issueType: SeoIssueType.MISSING_META_DESCRIPTION,
        severity: SeoIssueSeverity.HIGH,
        description: `Page "${path}" is missing a meta description.`,
      });
    }

    if (!data.h1Tag) {
      issues.push({
        issueType: SeoIssueType.MISSING_H1,
        severity: SeoIssueSeverity.HIGH,
        description: `Page "${path}" is missing an <h1> tag.`,
      });
    } else if (data.h1Count > 1) {
      issues.push({
        issueType: SeoIssueType.MULTIPLE_H1,
        severity: SeoIssueSeverity.MEDIUM,
        description: `Page "${path}" has ${data.h1Count} <h1> tags — should have exactly one.`,
      });
    }

    if (data.wordCount < 150) {
      issues.push({
        issueType: SeoIssueType.THIN_CONTENT,
        severity: SeoIssueSeverity.MEDIUM,
        description: `Page "${path}" has thin content (${data.wordCount} words).`,
      });
    }

    if (data.imageCount > 0 && data.imagesWithAltText < data.imageCount) {
      issues.push({
        issueType: SeoIssueType.MISSING_ALT_TEXT,
        severity: SeoIssueSeverity.MEDIUM,
        description: `Page "${path}" has ${data.imageCount - data.imagesWithAltText} of ${data.imageCount} images missing alt text.`,
      });
    }

    return issues;
  }

  /**
   * `path` is what the result is filed under; `url` is what gets fetched.
   * They are the same for every real route and differ only for the two
   * templates, where one sampled product/category page stands in for all of
   * them.
   */
  private async analyzePath(
    path: string,
    url: string = path,
  ): Promise<{ metric: SeoMetric; issues: SeoIssue[] } | null> {
    try {
      const data = await this.fetchAndExtract(url);
      const seoScore = this.computeScore(data);

      // The page's own SEO override, if an admin has saved one. The keyphrase
      // is what unlocks Yoast's keyphrase assessments; the title and
      // description are read from the RENDERED page rather than from here,
      // since the rendered values are what Google actually sees — if an
      // override has been saved but the page has not been rebuilt, the crawl
      // should report reality, not intent.
      const override = await this.seoPageRepo.findOne({ where: { path } });

      const yoastResult = analyzePageWithYoast({
        html: data.contentHtml || '<html></html>',
        title: data.title || undefined,
        metaDescription: data.metaDescription || undefined,
        focusKeyphrase: override?.focusKeyphrase || undefined,
        path,
      });

      const now = new Date();

      let metric = await this.seoMetricRepo.findOne({ where: { path } });
      if (!metric) {
        metric = this.seoMetricRepo.create({ path });
      }
      Object.assign(metric, {
        title: data.title,
        metaDescription: data.metaDescription,
        h1Tag: data.h1Tag,
        wordCount: data.wordCount,
        internalLinks: data.internalLinks,
        externalLinks: data.externalLinks,
        imageCount: data.imageCount,
        imagesWithAltText: data.imagesWithAltText,
        pageLoadTimeMs: data.pageLoadTimeMs,
        seoScore,
        // NULL, not 0, when the engine could not run — the columns are
        // nullable precisely so "not analyzed" is expressible. Zero would be
        // a claim about the page, it would drag the site average down, and it
        // would take precedence over the legacy seoScore in the `??` chain
        // that computes that average.
        yoastSeoScore: yoastResult.error ? null : yoastResult.seoScore,
        readabilityScore: yoastResult.error ? null : yoastResult.readabilityScore,
        seoProblems: yoastResult.seoProblems,
        readabilityProblems: yoastResult.readabilityProblems,
        yoastChecks: yoastResult.error ? null : yoastResult.checks,
        yoastError: yoastResult.error ?? null,
        skippedChecks: yoastResult.skippedChecks,
        lastAnalyzed: now,
      });
      metric = await this.seoMetricRepo.save(metric);

      await this.seoIssueRepo.delete({ path });
      const detected = this.detectIssues(path, data);
      const issues = detected.length
        ? await this.seoIssueRepo.save(detected.map((i) => this.seoIssueRepo.create({ path, ...i })))
        : [];

      return { metric, issues };
    } catch (err) {
      // A 404 means the page is gone, not that the crawl had a bad day — so
      // drop what we last knew about it. Without this a removed route keeps
      // its final score in the admin table indefinitely, which is how "/a-z"
      // went on reporting 712 words and a score of 84 after the page itself
      // had stopped existing. Any other failure (timeout, connection refused,
      // a 500) leaves the row alone: the page is probably still there and
      // deleting real history over a transient blip is the worse trade.
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 404 || status === 410) {
        await this.seoMetricRepo.delete({ path });
        await this.seoIssueRepo.delete({ path });
        this.logger.warn(`Dropped "${path}" from SEO metrics — page returned ${status}`);
      } else {
        this.logger.error(
          `Failed to analyze path "${path}": ${err instanceof Error ? err.message : err}`,
        );
      }
      return null;
    }
  }

  async analyzeAll() {
    const targets = await this.getPathsToCrawl();
    const paths = targets.map((t) => t.path);

    // Rows for a path that is no longer in the crawl list — a route the site
    // removed (this is what left "/a-z" showing in the admin table with its
    // last good score, long after the page itself started 404ing), or the
    // per-slug product rows from when this crawl listed every product
    // individually. Deleted up front rather than only skipped going forward,
    // so a stale result does not sit in the list forever.
    if (paths.length) {
      await this.seoMetricRepo
        .createQueryBuilder()
        .delete()
        .where('path NOT IN (:...paths)', { paths })
        .execute();
      await this.seoIssueRepo
        .createQueryBuilder()
        .delete()
        .where('path NOT IN (:...paths)', { paths })
        .execute();
    }

    const results: { metric: SeoMetric; issues: SeoIssue[] }[] = [];

    for (const target of targets) {
      const result = await this.analyzePath(target.path, target.url);
      if (result) results.push(result);
      await sleep(FETCH_DELAY_MS);
    }

    this.logger.log(`Analyzed ${results.length}/${targets.length} pages`);
    return {
      analyzed: results.length,
      total: targets.length,
      metrics: results.map((r) => r.metric),
      issues: results.flatMap((r) => r.issues),
    };
  }

  async getOverview() {
    const metrics = await this.seoMetricRepo.find();
    const issues = await this.seoIssueRepo.find();

    const totalPagesAnalyzed = metrics.length;
    // Averaged over Yoast's score, falling back to our own rubric for rows
    // crawled before Yoast was wired in. Our rubric is deliberately generous
    // (it rates "has a title, has a meta description, has words" and lands on
    // 100 for nearly everything), so headlining it made the card useless as a
    // signal — every page looked perfect.
    const scored = metrics.filter((m) => m.yoastSeoScore !== null || m.seoScore !== null);
    const averageScore = scored.length
      ? Math.round(
          scored.reduce((sum, m) => sum + (m.yoastSeoScore ?? m.seoScore ?? 0), 0) / scored.length,
        )
      : 0;

    const issuesBySeverity: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const issue of issues) {
      issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1;
    }

    const lastAnalyzed = metrics.reduce<Date | null>((latest, m) => {
      if (!m.lastAnalyzed) return latest;
      if (!latest || m.lastAnalyzed > latest) return m.lastAnalyzed;
      return latest;
    }, null);

    return {
      totalPagesAnalyzed,
      averageScore,
      totalIssues: issues.length,
      issuesBySeverity,
      lastAnalyzed,
    };
  }

  async getIssues(isFixed?: boolean) {
    const where = typeof isFixed === 'boolean' ? { isFixed } : {};
    return this.seoIssueRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getMetrics() {
    return this.seoMetricRepo.find({ order: { path: 'ASC' } });
  }

  // ------------------------------------------------------- per-product SEO

  /**
   * Scores one product and explains what to fix.
   *
   * Stateless — it writes nothing — so the admin form can call it on every
   * keystroke (debounced) and get the same number that will later be stored.
   * The duplicate-title/description checks need the rest of the catalogue,
   * which is why this lives in a service rather than being run in the browser.
   */
  async analyzeProduct(input: ProductSeoInput): Promise<ProductSeoResult> {
    const qb = this.productSeoRepo
      .createQueryBuilder('seo')
      .select(['seo.seoTitle', 'seo.metaDescription', 'seo.productId']);

    if (input.productId) {
      qb.where('seo.productId != :id', { id: input.productId });
    }
    const others = await qb.getMany();

    return analyzeProductSeo({
      ...input,
      existingTitles: others.map((o) => o.seoTitle).filter((t): t is string => !!t),
      existingDescriptions: others
        .map((o) => o.metaDescription)
        .filter((d): d is string => !!d),
    });
  }

  /**
   * Builds the analyser input from a saved product, so create/update can
   * store the score without the caller assembling the shape by hand.
   */
  async scoreSavedProduct(productId: string): Promise<ProductSeoResult | null> {
    const product = await this.productsRepo.findOne({
      where: { id: productId },
      relations: ['seo', 'gallery'],
    });
    if (!product) return null;

    const gallery = product.gallery || [];
    return this.analyzeProduct({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      shortDescription: product.shortDescription,
      chemicalDescriptions: product.chemicalDescriptions,
      inciName: product.inciName,
      casNumber: product.casNumber,
      focusKeyphrase: product.seo?.focusKeyphrase ?? null,
      seoTitle: product.seo?.seoTitle ?? null,
      metaDescription: product.seo?.metaDescription ?? null,
      imageCount: gallery.length,
      imagesWithAlt: gallery.filter((g) => !!g.altText && g.altText.trim().length > 0).length,
    });
  }
}
