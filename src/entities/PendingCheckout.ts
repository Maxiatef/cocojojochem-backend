import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// Holds everything needed to create a real Order, from the moment a
// customer clicks "Continue to Payment" until Stripe actually confirms the
// payment via webhook. No Order row exists for this checkout attempt until
// then — an abandoned/failed Stripe Checkout Session leaves behind a
// PendingCheckout row (cleaned up after 24h, see OrdersCleanupService), not
// a phantom PENDING order, stock isn't decremented, and the cart/coupon
// usage aren't touched.
@Entity('pending_checkouts')
export class PendingCheckout {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', nullable: true })
  guestEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  guestName: string | null;

  @Column({ type: 'varchar', nullable: true })
  guestPhone: string | null;

  // JSON-serialized array of order-item snapshots: { productVariantId,
  // productName, variantLabel, sku, imageUrl, quantity, price, purchaseType }
  @Column({ type: 'text' })
  itemsJson: string;

  @Column('decimal', { precision: 12, scale: 2 })
  subtotal: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  shippingCost: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  taxAmount: string;

  @Column({ type: 'int', nullable: true })
  couponId: number | null;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  couponAmount: string;

  @Column({ type: 'text', nullable: true })
  shippingAddress: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
