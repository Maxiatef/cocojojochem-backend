import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Cart } from './Cart';
import { ProductVariant } from './ProductVariant';

export enum PurchaseType {
  ONE_TIME = 'one-time',
  SUBSCRIPTION = 'subscription',
}

// Mirrors the real cocojojo.com localStorage cart item shape.
@Entity('cart_items')
export class CartItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  cartId: number;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cartId' })
  cart: Cart;

  @Column()
  productVariantId: number;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productVariantId' })
  variant: ProductVariant;

  @Column({ default: 1 })
  quantity: number;

  // Price snapshot at time of add, in case the variant price changes later
  @Column('decimal', { precision: 10, scale: 2 })
  price: string;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  regularPrice: string | null;

  @Column({ type: 'enum', enum: PurchaseType, default: PurchaseType.ONE_TIME })
  purchaseType: PurchaseType;

  @Column({ type: 'int', nullable: true })
  subscriptionFrequencyMonths: number | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  subscriptionDiscountPercent: string | null;
}
