import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('seo_pages')
export class SeoPage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  path: string; // "/", "/wholesale/categories/acids"

  @Column({ type: 'varchar', nullable: true })
  metaTitle: string | null;

  @Column({ type: 'text', nullable: true })
  metaDescription: string | null;

  @Column({ type: 'varchar', nullable: true })
  ogImageUrl: string | null;

  /**
   * The term this page is meant to rank for.
   *
   * Unlike the other columns this one never reaches the storefront — it is an
   * input to the SEO crawl. Without it Yoast's nine keyphrase assessments
   * cannot run, which is why an unset page scores identically to every other
   * page sharing its layout.
   */
  @Column({ type: 'varchar', nullable: true })
  focusKeyphrase: string | null;
}
