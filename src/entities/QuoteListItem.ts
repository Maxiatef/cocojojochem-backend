import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

// Server-side "quote list" (wishlist-style, pre-submission) — only for
// logged-in customers, mirroring Cart/CartItem's own-account-only pattern.
// Guest quote lists stay client-side (localStorage, quoteListStore.ts) until
// the customer logs in, at which point they're merged in via POST
// /quote-list/merge, same flow as the cart's guest-to-server merge.
//
// Keyed by productId + variantLabel (not a real ProductVariant FK) because
// a quote request is a request for pricing, not a purchase — it doesn't
// need a real SKU, just enough info to describe what the customer wants a
// quote for (matches QuoteRequestItem, the final submitted request, which
// is equally descriptive-only).
@Entity('quote_list_items')
export class QuoteListItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  userId: number;

  @Column()
  productId: number;

  @Column()
  productSlug: string;

  @Column()
  productName: string;

  @Column({ type: 'varchar', nullable: true })
  variantLabel: string | null;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column({ default: 1 })
  quantity: number;

  @CreateDateColumn()
  createdAt: Date;
}
