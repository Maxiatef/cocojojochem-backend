import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('seo_metrics')
export class SeoMetric {
  @PrimaryGeneratedColumn()
  id: number;

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

  @Column({ type: 'timestamptz', nullable: true })
  lastAnalyzed: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
