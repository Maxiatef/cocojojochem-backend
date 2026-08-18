import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Standalone — no FK relations to Product/Category, matches the real site's schema.
@Entity('bulk_sale_discounts')
export class BulkSaleDiscount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column('decimal', { precision: 5, scale: 2 })
  discountPercent: string;

  @Column({ type: 'timestamptz' })
  startDate: Date;

  @Column({ type: 'timestamptz' })
  endDate: Date;

  @Column({ default: true })
  isActive: boolean;

  // JSON-stringified number[] arrays
  @Column({ type: 'text', nullable: true })
  categoryIds: string | null;

  @Column({ type: 'text', nullable: true })
  productIds: string | null;

  @Column({ type: 'text', nullable: true })
  variantIds: string | null;

  @Column({ default: false })
  applyToAllVariants: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
