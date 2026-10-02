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
//
// `userId` and `productId` ARE constrained, ON DELETE CASCADE, the same as
// WishlistItem — see migration 1788910000000. Declared in SQL rather than as
// @ManyToOne here, matching WishlistItem: neither entity ever loads the
// related row, so a relation would only add a join nothing uses.
@Entity('quote_list_items')
export class QuoteListItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  // Null for a supplier-reference line (see `source`).
  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

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
