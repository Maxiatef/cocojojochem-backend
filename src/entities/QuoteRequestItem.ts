import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { QuoteRequest } from './QuoteRequest';

@Entity('quote_request_items')
export class QuoteRequestItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  quoteRequestId: string;

  @ManyToOne(() => QuoteRequest, (qr) => qr.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quoteRequestId' })
  quoteRequest: QuoteRequest;

  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @Column()
  productName: string; // snapshot in case product is later deleted

  @Column({ type: 'int', nullable: true })
  quantity: number | null;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
