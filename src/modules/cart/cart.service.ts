import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem, ProductVariant, PurchaseType } from '../../entities';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { getEffectivePrice } from '../../common/pricing.util';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
  ) {}

  private async getOrCreateCart(userId: string) {
    let cart = await this.cartRepo.findOne({
      where: { userId },
      relations: ['items', 'items.variant', 'items.variant.product'],
    });
    if (!cart) {
      cart = await this.cartRepo.save(this.cartRepo.create({ userId, items: [] }));
    }
    await this.syncPrices(cart);
    return cart;
  }

  /**
   * Re-prices the cart against its variants' current effective price.
   *
   * CartItem.price is a stored snapshot taken when the item was added, and a
   * cart can sit for days. Without this, a sale that starts after the item was
   * added never reaches the customer, and — worse — a sale that has since
   * ended keeps charging the old discounted price all the way through
   * checkout, because the order lines are built from these rows.
   *
   * Runs on every cart read and every cart mutation, since they all go through
   * getOrCreateCart. Only rows whose price actually moved are written.
   */
  private async syncPrices(cart: Cart): Promise<void> {
    const stale = (cart.items ?? []).filter((item) => {
      if (!item.variant) return false;
      const current = getEffectivePrice(item.variant);
      if (Number(current) === Number(item.price)) return false;
      item.price = current;
      return true;
    });
    if (stale.length) await this.cartItemRepo.save(stale);
  }

  getCart(userId: string) {
    return this.getOrCreateCart(userId);
  }

  // Sums quantity already in the cart for a given variant, across all cart
  // items (not just one row) — the order limit applies cumulatively per
  // variant, not per line item. `excludeItemId` lets updateItemQuantity
  // recompute "everything else in the cart" before adding the new quantity.
  private quantityAlreadyInCart(cart: Cart, variantId: string, excludeItemId?: string): number {
    return cart.items
      .filter((i) => i.productVariantId === variantId && i.id !== excludeItemId)
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  // Enforces the per-variant order limit (limitPerOrder + maxOrderQuantity)
  // cumulatively across the whole cart for that variant, not per line item.
  private assertWithinOrderLimit(
    variant: ProductVariant,
    productName: string | undefined,
    alreadyInCart: number,
    requestedTotal: number,
  ) {
    if (!variant.limitPerOrder || variant.maxOrderQuantity == null) return;
    if (requestedTotal <= variant.maxOrderQuantity) return;

    const remaining = Math.max(variant.maxOrderQuantity - alreadyInCart, 0);
    const label = productName ? `${productName} (${variant.label})` : variant.label;
    if (alreadyInCart > 0) {
      throw new BadRequestException(
        `Only ${variant.maxOrderQuantity} units of ${label} can be ordered at a time. You already have ${alreadyInCart} in your cart — you can add up to ${remaining} more.`,
      );
    }
    throw new BadRequestException(
      `Only ${variant.maxOrderQuantity} units of ${label} can be ordered at a time. Please reduce the quantity and try again.`,
    );
  }

  /**
   * Enforces the per-variant minimum order quantity.
   *
   * The mirror image of assertWithinOrderLimit above, and counted the same
   * way: cumulatively across every line of that variant in the cart, not per
   * line item. Someone with 3 + 2 of a variant whose MOQ is 5 has met it.
   *
   * Null MOQ means no minimum — that is the state of every variant today, so
   * this is inert until someone sets one.
   *
   * Note this can still be escaped by removing a line afterwards, which is
   * why OrdersService re-checks the whole cart at checkout. The cart is a
   * convenience; the order is the boundary.
   */
  private assertMeetsMinimumOrder(
    variant: ProductVariant,
    productName: string | undefined,
    requestedTotal: number,
  ) {
    if (variant.moq == null || variant.moq <= 1) return;
    if (requestedTotal >= variant.moq) return;

    const label = productName ? `${productName} (${variant.label})` : variant.label;
    throw new BadRequestException(
      `${label} has a minimum order of ${variant.moq} units. Please increase the quantity to at least ${variant.moq}.`,
    );
  }

  // Variant stays fully visible/browsable on the storefront regardless — this
  // only blocks the purchase action itself until availableFrom arrives.
  private assertAvailable(variant: ProductVariant, productName?: string) {
    if (!variant.availableFrom || variant.availableFrom <= new Date()) return;
    const label = productName ? `${productName} (${variant.label})` : variant.label;
    const when = variant.availableFrom.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    throw new BadRequestException(`${label} isn't available for purchase yet — it becomes available on ${when}.`);
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const variant = await this.variantRepo.findOne({
      where: { id: dto.productVariantId },
      relations: ['product'],
    });
    if (!variant) {
      throw new NotFoundException(
        `We couldn't find that product variant (#${dto.productVariantId}). It may have been removed — please refresh and try again.`,
      );
    }

    this.assertAvailable(variant, variant.product?.name);

    const alreadyInCart = this.quantityAlreadyInCart(cart, variant.id);
    this.assertWithinOrderLimit(variant, variant.product?.name, alreadyInCart, alreadyInCart + dto.quantity);
    this.assertMeetsMinimumOrder(variant, variant.product?.name, alreadyInCart + dto.quantity);

    const item = this.cartItemRepo.create({
      cartId: cart.id,
      productVariantId: variant.id,
      quantity: dto.quantity,
      // The effective price, not the list price: a variant with an active
      // salePrice goes into the cart at the sale price.
      price: getEffectivePrice(variant),
      purchaseType: dto.purchaseType || PurchaseType.ONE_TIME,
      subscriptionFrequencyMonths: dto.subscriptionFrequencyMonths ?? null,
    });
    return this.cartItemRepo.save(item);
  }

  async updateItemQuantity(userId: string, itemId: string, quantity: number) {
    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(
        `This cart item no longer exists — it may have already been removed. Please refresh your cart.`,
      );
    }

    const variant =
      item.variant ?? (await this.variantRepo.findOne({ where: { id: item.productVariantId }, relations: ['product'] }));
    if (variant) {
      this.assertAvailable(variant, variant.product?.name);
      const alreadyInCart = this.quantityAlreadyInCart(cart, item.productVariantId, item.id);
      this.assertWithinOrderLimit(variant, variant.product?.name, alreadyInCart, alreadyInCart + quantity);
      this.assertMeetsMinimumOrder(variant, variant.product?.name, alreadyInCart + quantity);
    }

    item.quantity = quantity;
    return this.cartItemRepo.save(item);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(
        `This cart item no longer exists — it may have already been removed. Please refresh your cart.`,
      );
    }
    return this.cartItemRepo.remove(item);
  }

  // Totals joined from cart items + their live variant price/stock — what the
  // cart drawer/checkout summary needs without recomputing on the frontend.
  async getSummary(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const subtotal = cart.items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const outOfStockItems = cart.items.filter(
      (item) => item.variant?.stockStatus === 'OUT_OF_STOCK',
    );
    return { itemCount, subtotal, outOfStockItems, cart };
  }

  // Merges a guest (localStorage) cart into the server cart on login/register.
  async mergeGuestCart(userId: string, guestItems: AddCartItemDto[]) {
    const cart = await this.getOrCreateCart(userId);
    for (const guestItem of guestItems) {
      const existing = cart.items.find(
        (i) => i.productVariantId === guestItem.productVariantId,
      );
      if (existing) {
        // Clamp (rather than throw) when merging on login — a login shouldn't
        // hard-fail because a guest cart plus server cart happen to exceed a
        // variant's per-order limit; cap at the limit instead.
        const variant =
          existing.variant ??
          (await this.variantRepo.findOne({ where: { id: existing.productVariantId } }));
        const desired = existing.quantity + guestItem.quantity;
        existing.quantity =
          variant?.limitPerOrder && variant.maxOrderQuantity != null
            ? Math.min(desired, variant.maxOrderQuantity)
            : desired;
        await this.cartItemRepo.save(existing);
      } else {
        await this.addItem(userId, guestItem);
      }
    }
    return this.getOrCreateCart(userId);
  }
}
