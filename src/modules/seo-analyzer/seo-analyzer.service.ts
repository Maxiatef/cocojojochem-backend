import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { SeoMetric, SeoPage } from '../../entities';
import { SeoIssue, SeoIssueSeverity, SeoIssueType } from '../../entities/SeoIssue';

const KNOWN_TOP_LEVEL_PATHS = ['/', '/products', '/categories', '/functions', '/a-z'];
const MAX_PATHS = 20;
const FETCH_DELAY_MS = 300;

interface ExtractedPageData {
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class SeoAnalyzerService {
  private readonly logger = new Logger('SeoAnalyzer');
  private readonly baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  constructor(
    @InjectRepository(SeoMetric)
    private readonly seoMetricRepo: Repository<SeoMetric>,
    @InjectRepository(SeoIssue)
    private readonly seoIssueRepo: Repository<SeoIssue>,
    @InjectRepository(SeoPage)
    private readonly seoPageRepo: Repository<SeoPage>,
  ) {}

  async getPathsToCrawl(): Promise<string[]> {
    const seoPages = await this.seoPageRepo.find();
    const combined = new Set<string>([...KNOWN_TOP_LEVEL_PATHS, ...seoPages.map((p) => p.path)]);
    return Array.from(combined).slice(0, MAX_PATHS);
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

    const images = $('img');
    const imageCount = images.length;
    let imagesWithAltText = 0;
    images.each((_, el) => {
      const alt = $(el).attr('alt');
      if (alt && alt.trim().length > 0) imagesWithAltText++;
    });

    return {
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

  private async analyzePath(path: string): Promise<{ metric: SeoMetric; issues: SeoIssue[] } | null> {
    try {
      const data = await this.fetchAndExtract(path);
      const seoScore = this.computeScore(data);
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
      this.logger.error(`Failed to analyze path "${path}": ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  async analyzeAll() {
    const paths = await this.getPathsToCrawl();
    const results: { metric: SeoMetric; issues: SeoIssue[] }[] = [];

    for (const path of paths) {
      const result = await this.analyzePath(path);
      if (result) results.push(result);
      await sleep(FETCH_DELAY_MS);
    }

    this.logger.log(`Analyzed ${results.length}/${paths.length} pages`);
    return {
      analyzed: results.length,
      total: paths.length,
      metrics: results.map((r) => r.metric),
      issues: results.flatMap((r) => r.issues),
    };
  }

  async getOverview() {
    const metrics = await this.seoMetricRepo.find();
    const issues = await this.seoIssueRepo.find();

    const totalPagesAnalyzed = metrics.length;
    const scored = metrics.filter((m) => m.seoScore !== null);
    const averageScore = scored.length
      ? Math.round(scored.reduce((sum, m) => sum + (m.seoScore || 0), 0) / scored.length)
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
}
