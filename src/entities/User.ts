import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Company } from './Company';
import { QuoteRequest } from './QuoteRequest';
import { Cart } from './Cart';
import { Order } from './Order';

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  SALES = 'SALES',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  passwordHash: string | null;

  @Column()
  fullName: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  @Column({ type: 'int', nullable: true })
  companyId: number | null;

  @ManyToOne(() => Company, (company) => company.users, { nullable: true })
  @JoinColumn({ name: 'companyId' })
  company: Company | null;

  @OneToMany(() => QuoteRequest, (qr) => qr.user)
  quoteRequests: QuoteRequest[];

  @OneToOne(() => Cart, (cart) => cart.user)
  cart: Cart;

  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];

  @CreateDateColumn()
  createdAt: Date;
}
