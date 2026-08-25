import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CouponType {
  PERCENTAGE_CART = 'PERCENTAGE_CART',
  PERCENTAGE_PRODUCT = 'PERCENTAGE_PRODUCT',
  FIXED_CART = 'FIXED_CART',
  FIXED_PRODUCT = 'FIXED_PRODUCT',
}

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: CouponType, default: CouponType.PERCENTAGE_CART })
  type: CouponType;

  @Column('decimal', { precision: 10, scale: 2 })
  value: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  minOrderAmount: string | null;

  // "Maximum Spend" — inverse of minOrderAmount: the order total must be at
  // or below this amount for the coupon to be usable.
  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  maxOrderAmount: string | null;

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

  // Stored and round-trips correctly, but currently has no real effect since
  // checkout doesn't calculate shipping cost yet — no code path reads this
  // to waive a shipping charge today.
  @Column({ default: false })
  allowFreeShipping: boolean;

  // Stored and validated for future multi-coupon-per-order support. Today's
  // checkout only ever applies a single coupon at a time, so this flag is
  // currently a no-op in practice — but it must save/load correctly.
  @Column({ default: false })
  individualUseOnly: boolean;

  // When true, cart items whose variant is currently on sale (per
  // isSaleActive in common/pricing.util.ts) are excluded from eligibility,
  // regardless of category/product/variant/brand restrictions.
  @Column({ default: false })
  excludeSaleItems: boolean;

  // Exact emails or wildcard patterns (e.g. "*@company.com"), case-insensitive.
  @Column({ type: 'text', array: true, nullable: true })
  allowedEmails: string[] | null;

  // Caps how many distinct eligible cart LINES (not total quantity) receive
  // the discount — matches WooCommerce's "limit to X items" semantics.
  @Column({ type: 'int', nullable: true })
  limitUsageToXItems: number | null;

  // Custom extension (not native WooCommerce) mirroring the category
  // restriction pattern: exclusion-first, then inclusion-OR.
  @Column({ type: 'text', array: true, nullable: true })
  includedBrands: string[] | null;

  @Column({ type: 'text', array: true, nullable: true })
  excludedBrands: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
