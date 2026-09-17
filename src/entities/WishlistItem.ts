import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

// A customer's saved products. Own-account-only, the same as Cart/CartItem and
// QuoteListItem; a guest's wishlist stays client-side (localStorage,
// wishlistStore.ts) until they sign in, at which point it is merged in via
// POST /wishlist/merge — the same flow the cart and quote list already use.
//
// Deliberately stores only the product id, with no name/image/price snapshot.
// QuoteListItem snapshots those because a quote is a point-in-time request for
// specific terms; a wishlist is a pointer to whatever the product is *now*, so
// it joins live and a renamed or repriced product shows its current state.
//
// Product-level, not variant-level: one heart per material. Pack size is
// chosen when the item moves to the cart, which is where that decision
// actually belongs.
@Entity('wishlist_items')
@Index('UQ_wishlist_user_product', ['userId', 'productId'], { unique: true })
export class WishlistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  productId: string;

  @CreateDateColumn()
  createdAt: Date;
}
