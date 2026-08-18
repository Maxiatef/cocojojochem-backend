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
import { Company } from './Company';
import { User } from './User';
import { QuoteRequestItem } from './QuoteRequestItem';

export enum RequestType {
  QUOTE = 'QUOTE',
  SAMPLE = 'SAMPLE',
  WHITE_LABEL = 'WHITE_LABEL',
  CONTACT = 'CONTACT',
}

export enum RequestStatus {
  NEW = 'NEW',
  IN_PROGRESS = 'IN_PROGRESS',
  QUOTED = 'QUOTED',
  WON = 'WON',
  LOST = 'LOST',
}

@Entity('quote_requests')
export class QuoteRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  companyId: number | null;

  @ManyToOne(() => Company, (company) => company.quoteRequests, { nullable: true })
  @JoinColumn({ name: 'companyId' })
  company: Company | null;

  @Column({ type: 'int', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, (user) => user.quoteRequests, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column()
  fullName: string;

  @Column()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  companyName: string | null;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'enum', enum: RequestType, default: RequestType.QUOTE })
  type: RequestType;

  @Column({ type: 'enum', enum: RequestStatus, default: RequestStatus.NEW })
  status: RequestStatus;

  @OneToMany(() => QuoteRequestItem, (item) => item.quoteRequest, { cascade: true })
  items: QuoteRequestItem[];

  @Column({ type: 'int', nullable: true })
  assignedToId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
