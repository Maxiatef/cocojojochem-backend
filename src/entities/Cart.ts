import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  OneToMany,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';
import { CartItem } from './CartItem';

// Server-side cart is only for logged-in cross-device sync.
// Guest carts stay client-side (localStorage), matching cocojojo.com's own behavior.
@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  userId: number;

  @OneToOne(() => User, (user) => user.cart, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => CartItem, (item) => item.cart, { cascade: true })
  items: CartItem[];

  @UpdateDateColumn()
  updatedAt: Date;
}
