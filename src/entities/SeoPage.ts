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
}
