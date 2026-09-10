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

// Soft-delete state. DELETED accounts can't log in and appear in the admin
// Recycle Bin, from where they're either restored or permanently deleted.
//
// Deliberately NOT TypeORM's @DeleteDateColumn: that appends
// `deletedAt IS NULL` to every query app-wide, which would strip the customer
// off past orders (see the leftJoinAndSelect('order.user') in
// OrdersService.findAllAdmin) unless `withDeleted: true` were added in a dozen
// places. An explicit enum leaves every existing query behaving as it does now.
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  passwordHash: string | null;

  // `fullName` stays the canonical display name — it's read across orders,
  // emails, shipping labels, and the storefront. firstName/lastName were
  // added for the admin user editor (which edits the name in two parts, as
  // WooCommerce does) and `fullName` is recomposed from them on save, so
  // every existing consumer keeps working unchanged.
  @Column()
  fullName: string;

  @Column({ type: 'varchar', nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CUSTOMER })
  role: UserRole;

  // The single authoritative gate for whether this account may be used.
  // Checked in JwtStrategy (every request), login, refresh, and the
  // password-reset paths. Never branch on `deletedAt` — it exists only so the
  // Recycle Bin can show when the account was removed.
  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

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
