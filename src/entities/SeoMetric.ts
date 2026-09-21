import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('seo_metrics')
export class SeoMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  path: string;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  metaDescription: string | null;

  @Column({ type: 'varchar', nullable: true })
  h1Tag: string | null;

  @Column({ type: 'int', nullable: true })
  wordCount: number | null;

  @Column({ type: 'int', default: 0 })
  internalLinks: number;

  @Column({ type: 'int', default: 0 })
  externalLinks: number;

  @Column({ type: 'int', default: 0 })
  imageCount: number;

  @Column({ type: 'int', default: 0 })
  imagesWithAltText: number;

  @Column({ type: 'int', nullable: true })
  pageLoadTimeMs: number | null;

  @Column({ type: 'int', nullable: true })
  seoScore: number | null;

  /**
   * Yoast's own SEO verdict, kept separate from `seoScore` above.
   *
   * The two measure different things and routinely disagree: `seoScore` is our
   * catalogue rubric (has a title, has a meta description, enough words),
   * while this one is Yoast's blog-tuned analysis. Collapsing them into one
   * column would silently discard whichever ran second.
   */
  @Column({ type: 'int', nullable: true })
  yoastSeoScore: number | null;

  @Column({ type: 'int', nullable: true })
  readabilityScore: number | null;

  @Column({ type: 'int', default: 0 })
  seoProblems: number;

  @Column({ type: 'int', default: 0 })
  readabilityProblems: number;

  /** The full Yoast feedback list — see PageYoastCheck in page-yoast.rules.ts. */
  @Column({ type: 'jsonb', nullable: true })
  yoastChecks: any | null;

  /**
   * Why the Yoast pass produced nothing, when it produced nothing.
   *
   * The scores next to it are nullable so "not analyzed" is expressible, but
   * a NULL on its own does not say why — and the reason has so far only
   * existed in a server log, which is exactly where nobody looks when a
   * dashboard says "—". Stored so the admin panel can answer the question
   * itself. NULL whenever the analysis succeeded.
   */
  @Column({ type: 'text', nullable: true })
  yoastError: string | null;

  /**
   * Assessments Yoast returned that were excluded as inapplicable — the
   * keyphrase family, which a crawled page has no field for. Stored so the UI
   * can say so out loud rather than quietly showing a shorter list.
   */
  @Column({ type: 'int', default: 0 })
  skippedChecks: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastAnalyzed: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
