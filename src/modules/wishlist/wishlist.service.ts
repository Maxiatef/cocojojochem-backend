import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product, ProductVisibility, WishlistItem } from '../../entities';
import { withPricing } from '../../common/pricing.util';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem)
    private readonly repo: Repository<WishlistItem>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  private rows(userId: number) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /**
   * The saved products, newest first, resolved against the live catalogue.
   *
   * A product that has since been unpublished or made private is dropped from
   * the response but its row is kept — unpublishing is often temporary, and
   * silently deleting someone's saved item because of a staff action they
   * cannot see would be the wrong trade.
   */
  async getItems(userId: number) {
    const rows = await this.rows(userId);
    if (rows.length === 0) return [];

    const products = await this.productsRepo.find({
      where: {
        id: In(rows.map((r) => r.productId)),
        isPublished: true,
        visibility: ProductVisibility.PUBLIC,
      },
      relations: ['variants', 'category'],
    });

    const byId = new Map(products.map((p) => [p.id, p]));

    return rows
      .map((row) => {
        const product = byId.get(row.productId);
        if (!product) return null;
        return {
          id: row.id,
          productId: row.productId,
          savedAt: row.createdAt,
          product: { ...product, variants: (product.variants || []).map(withPricing) },
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async getIds(userId: number): Promise<number[]> {
    const rows = await this.rows(userId);
    return rows.map((r) => r.productId);
  }

  /**
   * The badge count.
   *
   * Counts rows, not resolved products — it has to be cheap enough to run on
   * every page load, and a count that dipped because a product was briefly
   * unpublished would read as "the site lost my saves".
   */
  async getSummary(userId: number) {
    const count = await this.repo.count({ where: { userId } });
    return { count };
  }

  /**
   * Saves a product. Saving one that is already saved is a no-op, not an
   * error — the client treats this as a toggle, and a 409 on "add" would make
   * a double-click look like a failure.
   */
  async addItem(userId: number, productId: number) {
    const product = await this.productsRepo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException(`Product #${productId} not found`);

    const existing = await this.repo.findOne({ where: { userId, productId } });
    if (existing) return existing;

    return this.repo.save(this.repo.create({ userId, productId }));
  }

  /**
   * Folds a guest's localStorage wishlist into their account on sign-in.
   *
   * A union, never a replacement: someone who saved three products on their
   * phone and two on a laptop should end up with five, not whichever device
   * signed in last. Ids that do not resolve to a real product are skipped
   * rather than failing the merge — this runs during login, and a stale id in
   * localStorage must not be able to block signing in.
   */
  async mergeGuestList(userId: number, productIds: number[]) {
    const ids = Array.from(new Set(productIds || [])).filter((id) => Number.isInteger(id));
    if (ids.length === 0) return this.getSummary(userId);

    const [existing, realProducts] = await Promise.all([
      this.repo.find({ where: { userId } }),
      this.productsRepo.find({ where: { id: In(ids) }, select: ['id'] }),
    ]);

    const alreadySaved = new Set(existing.map((r) => r.productId));
    const real = new Set(realProducts.map((p) => p.id));
    const toAdd = ids.filter((id) => real.has(id) && !alreadySaved.has(id));

    if (toAdd.length) {
      await this.repo.save(toAdd.map((productId) => this.repo.create({ userId, productId })));
    }
    return this.getSummary(userId);
  }

  async removeItem(userId: number, productId: number) {
    const item = await this.repo.findOne({ where: { userId, productId } });
    // Removing something already gone is the state the caller wanted, so this
    // succeeds quietly rather than erroring on a double-click.
    if (item) await this.repo.remove(item);
    return this.getSummary(userId);
  }

  async clear(userId: number) {
    const items = await this.rows(userId);
    if (items.length) await this.repo.remove(items);
    return { count: 0 };
  }
}
