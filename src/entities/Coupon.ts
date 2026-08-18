import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CouponType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
}

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: CouponType, default: CouponType.PERCENTAGE })
  type: CouponType;

  @Column('decimal', { precision: 10, scale: 2 })
  value: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  minOrderAmount: string | null;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  maxDiscount: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startDate: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endDate: Date | null;

  @Column({ type: 'int', nullable: true })
  usageLimit: number | null;

  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: true })
  applicableToAllCategories: boolean;

  @Column({ default: true })
  applicableToAllProducts: boolean;

  // JSON-stringified number[] arrays
  @Column({ type: 'text', nullable: true })
  excludedCategoryIds: string | null;

  @Column({ type: 'text', nullable: true })
  excludedProductIds: string | null;

  @Column({ type: 'text', nullable: true })
  excludedVariantIds: string | null;

  @Column({ type: 'text', nullable: true })
  includedCategoryIds: string | null;

  @Column({ type: 'text', nullable: true })
  includedProductIds: string | null;

  @Column({ type: 'text', nullable: true })
  includedVariantIds: string | null;

  @Column({ type: 'int', nullable: true })
  maxUsagePerUser: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
