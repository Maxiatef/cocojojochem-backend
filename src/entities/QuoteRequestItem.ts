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

  // COCOJOJO = a product in our catalog (productId set). SUPPLIER_REFERENCE =
  // a material from the supplier reference library on the storefront, which
  // is not in our catalog: productId is null and referenceCode identifies it.
  @Column({ type: 'varchar', length: 32, default: 'COCOJOJO' })
  source: 'COCOJOJO' | 'SUPPLIER_REFERENCE';

  @Column({ type: 'varchar', length: 120, nullable: true })
  referenceCode: string | null;

  // The supplier's original listing, for reference lines.
  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceUrl: string | null;
}
