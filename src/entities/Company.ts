import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { User } from './User';
import { QuoteRequest } from './QuoteRequest';

export enum AccountStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  taxId: string | null;

  @Column({ type: 'varchar', nullable: true })
  website: string | null;

  @Column({ type: 'varchar', nullable: true })
  industry: string | null;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.PENDING })
  status: AccountStatus;

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @OneToMany(() => QuoteRequest, (qr) => qr.company)
  quoteRequests: QuoteRequest[];

  @CreateDateColumn()
  createdAt: Date;
}
