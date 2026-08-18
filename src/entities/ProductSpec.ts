import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './Product';

@Entity('product_specs')
export class ProductSpec {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productId: number;

  @ManyToOne(() => Product, (product) => product.specs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  key: string; // "Appearance", "pH", "Origin"

  @Column()
  value: string;
}
