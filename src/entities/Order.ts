import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';
import { OrderItem } from './OrderItem';

export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, (user) => user.orders, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  // Guest checkout: populated when userId is null (order placed without an account).
  @Column({ type: 'varchar', nullable: true })
  guestEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  guestName: string | null;

  @Column({ type: 'varchar', nullable: true })
  guestPhone: string | null;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @Column('decimal', { precision: 12, scale: 2 })
  subtotal: string;

  @Column('decimal', { precision: 12, scale: 2 })
  total: string;

  @Column({ type: 'text', nullable: true })
  shippingAddress: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Provider reference ids — populated once the corresponding integration is
  // wired up, and used by the webhook listeners in WebhooksModule to look up
  // which order an incoming event applies to.
  @Column({ type: 'varchar', nullable: true })
  stripePaymentIntentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  shipstationOrderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  shippoTrackingNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  trackingNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  carrierCode: string | null;

  @Column({ type: 'int', nullable: true })
  couponId: number | null;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  couponAmount: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
