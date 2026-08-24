import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem, ProductVariant, PurchaseType } from '../../entities';
import { AddCartItemDto } from './dto/add-cart-item.dto';

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

  private async getOrCreateCart(userId: number) {
    let cart = await this.cartRepo.findOne({
      where: { userId },
      relations: ['items', 'items.variant', 'items.variant.product'],
    });
    if (!cart) {
      cart = await this.cartRepo.save(this.cartRepo.create({ userId, items: [] }));
    }
    return cart;
  }

  getCart(userId: number) {
    return this.getOrCreateCart(userId);
  }

  // Sums quantity already in the cart for a given variant, across all cart
  // items (not just one row) — the order limit applies cumulatively per
  // variant, not per line item. `excludeItemId` lets updateItemQuantity
  // recompute "everything else in the cart" before adding the new quantity.
  private quantityAlreadyInCart(cart: Cart, variantId: number, excludeItemId?: number): number {
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

  async addItem(userId: number, dto: AddCartItemDto) {
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

    const item = this.cartItemRepo.create({
      cartId: cart.id,
      productVariantId: variant.id,
      quantity: dto.quantity,
      price: variant.price,
      purchaseType: dto.purchaseType || PurchaseType.ONE_TIME,
      subscriptionFrequencyMonths: dto.subscriptionFrequencyMonths ?? null,
    });
    return this.cartItemRepo.save(item);
  }

  async updateItemQuantity(userId: number, itemId: number, quantity: number) {
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
    }

    item.quantity = quantity;
    return this.cartItemRepo.save(item);
  }

  async removeItem(userId: number, itemId: number) {
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
  async getSummary(userId: number) {
    const cart = await this.getOrCreateCart(userId);
    const subtotal = cart.items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const outOfStockItems = cart.items.filter(
      (item) => item.variant?.stockStatus === 'OUT_OF_STOCK',
    );
    return { itemCount, subtotal, outOfStockItems, cart };
  }

  // Merges a guest (localStorage) cart into the server cart on login/register.
  async mergeGuestCart(userId: number, guestItems: AddCartItemDto[]) {
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
