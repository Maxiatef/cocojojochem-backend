import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Coupon } from './Coupon';
import { Order } from './Order';

@Entity('coupon_usages')
export class CouponUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  couponId: number;

  @ManyToOne(() => Coupon, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'couponId' })
  coupon: Coupon;

  @Column({ type: 'int', nullable: true, unique: true })
  orderId: number | null;

  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'orderId' })
  order: Order | null;

  @Column()
  email: string;

  @CreateDateColumn()
  usedAt: Date;
}
