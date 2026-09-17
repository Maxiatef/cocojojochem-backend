import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Order } from './Order';
import { ProductVariant } from './ProductVariant';
import { PurchaseType } from './CartItem';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'uuid', nullable: true })
  productVariantId: string | null;

  @ManyToOne(() => ProductVariant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'productVariantId' })
  variant: ProductVariant | null;

  // Snapshots — preserved even if the product/variant is later changed or deleted
  @Column()
  productName: string;

  @Column()
  variantLabel: string;

  @Column()
  sku: string;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column()
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  price: string;

  @Column({ type: 'enum', enum: PurchaseType, default: PurchaseType.ONE_TIME })
  purchaseType: PurchaseType;
}
