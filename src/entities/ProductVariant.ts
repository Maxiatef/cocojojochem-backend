import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './Product';

// Matches the real cocojojo.com wholesale schema's StockStatus enum exactly.
export enum StockStatus {
  IN_STOCK = 'IN_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  ON_BACKORDER = 'ON_BACKORDER',
}

// Matches the real cocojojo.com variant shape, e.g. "1 Gallon" / "1 Pail" / "1 Drum" / "25 KG"
@Entity('product_variants')
export class ProductVariant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  productId: number;

  @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ unique: true })
  sku: string;

  @Column()
  label: string; // "1 Gallon", "1 Pail", "10 Gallon", "1 Drum", "25 KG"

  @Column('decimal', { precision: 10, scale: 2 })
  price: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  salePrice: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  saleStart: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  saleEnd: Date | null;

  @Column({ type: 'int', nullable: true })
  stockQuantity: number | null;

  @Column({ type: 'enum', enum: StockStatus, default: StockStatus.IN_STOCK })
  stockStatus: StockStatus;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  // MOQ expressed at the variant level (e.g. minimum 1 drum) rather than product level
  @Column({ type: 'int', nullable: true })
  moq: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
