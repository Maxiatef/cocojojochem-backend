import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { Product } from './Product';

@Entity('product_seo')
export class ProductSeo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  productId: number;

  @OneToOne(() => Product, (product) => product.seo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'varchar', nullable: true })
  focusKeyphrase: string | null;

  @Column({ type: 'varchar', nullable: true })
  seoTitle: string | null;

  @Column({ type: 'text', nullable: true })
  metaDescription: string | null;

  @Column({ type: 'varchar', nullable: true })
  socialTitle: string | null;

  @Column({ type: 'text', nullable: true })
  socialDescription: string | null;

  @Column({ type: 'varchar', nullable: true })
  socialImageUrl: string | null;

  @Column({ type: 'text', array: true, nullable: true })
  tags: string[] | null;
}
