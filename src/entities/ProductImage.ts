import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './Product';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productId: number;

  @ManyToOne(() => Product, (product) => product.gallery, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  url: string;

  @Column({ type: 'varchar', nullable: true })
  altText: string | null;

  @Column({ default: 0 })
  sortOrder: number;
}
