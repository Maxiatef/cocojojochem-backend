import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityManager, In, IsNull, LessThan, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import {
  Cart,
  Order,
  OrderItem,
  OrderStatus,
  PendingCheckout,
  ProductVariant,
  PurchaseType,
  ShippingRateTierKind,
  StockStatus,
} from '../../entities';
import { getEffectivePrice } from '../../common/pricing.util';
import { UsersService } from '../users/users.service';
import { CouponsService } from '../coupons/coupons.service';
import { StripeService } from '../stripe/stripe.service';
import { CheckoutDto } from './dto/checkout.dto';
import { ShippingEstimateDto } from './dto/shipping-estimate.dto';
import { CarrierCode, UpdateTrackingDto } from './dto/update-tracking.dto';
import { SiteSettingsService } from '../site-settings/site-settings.service';
// ShipStation is disabled — Shippo is the sole shipping provider. The import
// is kept commented so restoring it is a one-line change.
// import { ShipStationService } from '../shipstation/shipstation.service';
import { ShippoService } from '../shippo/shippo.service';
import {
  computeAdvancedOrderStatus,
  mapShippoTrackingResponseToCheckpoints,
} from '../shippo/shippo.mapping';
import type { ShippoTrackingResponse, TrackingResult } from '../shippo/shippo.types';
import { ShippingRateTiersService } from '../shipping-rate-tiers/shipping-rate-tiers.service';
import { EmailService } from '../email/email.service';
import { getZoneForState, normalizeStateCode } from './shipping-zones.constants';
import { FREE_SHIPPING_THRESHOLD, isUnitedStates, roundMoney } from './shipping-rates.constants';

const DEFAULT_WHOLESALE_MINIMUM = 250;

// Snapshot of one cart line at checkout() time, serialized into
// PendingCheckout.itemsJson and turned back into a real OrderItem only once
// Stripe confirms payment (see finalizeCheckoutFromPendingId).
interface PendingCheckoutItemSnapshot {
  productVariantId: number;
  productName: string;
  variantLabel: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  price: string;
  purchaseType?: PurchaseType;
}

export interface ShippingEstimateResult {
  available: boolean;
  canShip: boolean;
  isDomestic: boolean;
  shippingCost?: number;
  zone?: number;
  zoneName?: string;
  regionLabel?: string;
  shippingMethod?: string;
  weightLb?: number;
  subtotal: number;
  wholesaleMinimum: number;
  meetsMinimum: boolean;
  minimumRemaining: number;
  isFreeShipping?: boolean;
  freeShippingThreshold?: number;
  amountAwayFromFreeShipping?: number;
  errorMessage?: string;
  taxAmount?: number;
  taxName?: string;
  // Advisory only — never blocks checkout. Shown for any order shipping to
  // Zone 8 (HI/AS/GU/MP/AP) — we don't ship there through the normal rate
  // tables (weight or drum), so no shipping cost is computed or charged;
  // the customer is told to contact us for a manual quote instead.
  carrierNotice?: string;
}

const ZONE_8_CARRIER_NOTICE = 'We do not ship to this destination through our standard rates. For shipping cost, please contact us.';

// Shippo types and the pure tracking/status mapping helpers now live in
// src/modules/shippo (shippo.types.ts / shippo.mapping.ts) alongside the
// service that owns the HTTP calls. Re-exported here because several
// consumers — WebhooksService, OrdersController and the frontend-facing
// return types — already import them from this module, and a second copy of
// the status map is exactly how the dead OUT_FOR_DELIVERY / PICKUP branches
// survived unnoticed (neither is a real top-level Shippo status).
export {
  ShippoTrackingResponse,
  TrackingCheckpoint,
  TrackingResult,
} from '../shippo/shippo.types';
export {
  ORDER_STATUS_RANK,
  computeAdvancedOrderStatus,
  mapShippoStatusToTargetOrderStatus,
  mapShippoTrackingResponseToCheckpoints,
} from '../shippo/shippo.mapping';

/**
 * Single shared point for writing a tracking number onto an Order. Sets both
 * `trackingNumber` (the human-facing field, and the one used together with
 * `carrierCode` for live Shippo tracking lookups in getTrackingCheckpoints)
 * AND `shippoTrackingNumber` (the field WebhooksService.handleShippoEvent
 * looks orders up by) to the same value, no matter which path is setting it —
 * an admin typing it in manually via updateTracking(), or the automatic
 * Shippo shipment-creation flow in createShipmentForOrder(). Keeping this in
 * one place means the two columns can never drift out of sync again.
 */
export function applyTrackingNumber(order: Order, trackingNumber: string, carrierCode: string): void {
  order.trackingNumber = trackingNumber;
  order.carrierCode = carrierCode;
  order.shippoTrackingNumber = trackingNumber;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepo: Repository<OrderItem>,
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
    @InjectRepository(PendingCheckout)
    private readonly pendingCheckoutsRepo: Repository<PendingCheckout>,
    private readonly usersService: UsersService,
    private readonly couponsService: CouponsService,
    private readonly jwtService: JwtService,
    private readonly stripeService: StripeService,
    private readonly siteSettingsService: SiteSettingsService,
    // private readonly shipStationService: ShipStationService, // disabled — see pushOrderToShipStation
    private readonly shippoService: ShippoService,
    private readonly shippingRateTiersService: ShippingRateTiersService,
    private readonly emailService: EmailService,
  ) {}

  private async getWholesaleMinimum(): Promise<number> {
    const raw = await this.siteSettingsService.getValue('WHOLESALE_MINIMUM');
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_WHOLESALE_MINIMUM;
  }

  private async getFreeShippingThreshold(): Promise<number> {
    const raw = await this.siteSettingsService.getValue('FREE_SHIPPING_THRESHOLD');
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : FREE_SHIPPING_THRESHOLD;
  }

  private async getDefaultShippingAmount(): Promise<number> {
    const raw = await this.siteSettingsService.getValue('DEFAULT_SHIPPING_AMOUNT');
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  private async getInternationalShippingAmount(): Promise<number> {
    const raw = await this.siteSettingsService.getValue('INTERNATIONAL_SHIPPING_AMOUNT');
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  // Admin Settings -> Tax tab saves this as a percentage (e.g. "8.5" for
  // 8.5%). Defaults to 0 (no tax charged) if unset/invalid — never
  // fabricates a rate.
  private async getTaxRate(): Promise<number> {
    const raw = await this.siteSettingsService.getValue('tax.value');
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  // Computed server-side from the real subtotal — never trusts a
  // client-sent tax amount, unlike shippingCost (see CheckoutDto comment),
  // since the subtotal itself is always server-computed anyway.
  private async computeTax(subtotal: number): Promise<number> {
    const rate = await this.getTaxRate();
    return roundMoney((subtotal * rate) / 100);
  }

  // Public (no auth) — used pre-checkout, before an account/order exists, to
  // show shipping cost + the wholesale-minimum banner as the customer fills
  // in their address. Domestic cost is computed from the admin-editable
  // Zone 1-7 rate tables (ShippingRateTiersService — WEIGHT and, for
  // drum-flagged variants, DRUM), with a flat admin-set default as the
  // last-resort fallback for any state without a zone mapping. There is no
  // separate per-state override anymore — editing a zone's rate changes
  // the cost for every state in that zone at once. International stays a
  // single flat admin-set amount. Every US state and every country can
  // always ship — no more "we don't ship here" / "manual quote required"
  // rejections.
  async getShippingEstimate(dto: ShippingEstimateDto): Promise<ShippingEstimateResult> {
    const variantIds = dto.items.map((i) => i.productVariantId);
    const variants = await this.variantsRepo.find({ where: { id: In(variantIds) } });
    const variantsById = new Map(variants.map((v) => [v.id, v]));

    let subtotal = 0;
    let totalWeight = 0;
    let drumCount = 0;
    for (const item of dto.items) {
      const variant = variantsById.get(item.productVariantId);
      if (!variant) {
        throw new BadRequestException(`Product variant #${item.productVariantId} not found`);
      }
      subtotal += Number(getEffectivePrice(variant)) * item.quantity;
      if (variant.isSoldByDrum) {
        // Drum-flagged variants are priced via the drum table (per-drum
        // flat rate), not the per-lb weight table — cart quantity IS the
        // drum count, and doesn't add to totalWeight.
        drumCount += item.quantity;
        continue;
      }
      // Not every variant has weightLb configured yet; 1 lb is a documented
      // fallback (matches the real site's own fallback-weight behavior), not
      // a claim about the item's real weight. Total cart weight now feeds
      // the domestic zone+weight rate table below.
      const weight = variant.weightLb != null ? Number(variant.weightLb) : 1;
      totalWeight += weight * item.quantity;
    }
    subtotal = roundMoney(subtotal);
    totalWeight = Number(totalWeight.toFixed(4));

    const wholesaleMinimum = await this.getWholesaleMinimum();
    const meetsMinimum = subtotal >= wholesaleMinimum;
    const minimumRemaining = roundMoney(Math.max(wholesaleMinimum - subtotal, 0));
    const isDomestic = isUnitedStates(dto.country);

    if (!meetsMinimum) {
      return {
        available: true,
        canShip: false,
        isDomestic,
        shippingCost: 0,
        subtotal,
        wholesaleMinimum,
        meetsMinimum: false,
        minimumRemaining,
        errorMessage: `Minimum purchase is $${wholesaleMinimum.toFixed(2)}. Current subtotal is $${subtotal.toFixed(2)}.`,
      };
    }

    const freeShippingThreshold = await this.getFreeShippingThreshold();
    const isFreeShipping = subtotal >= freeShippingThreshold;
    const amountAwayFromFreeShipping = roundMoney(Math.max(freeShippingThreshold - subtotal, 0));

    const taxAmount = await this.computeTax(subtotal);
    const taxNameRaw = await this.siteSettingsService.getValue('tax.name');
    const taxName = taxNameRaw || 'Tax';

    if (isFreeShipping) {
      return {
        available: true,
        canShip: true,
        isDomestic,
        shippingCost: 0,
        zoneName: isDomestic ? 'Free Shipping' : 'Free Shipping (International)',
        shippingMethod: 'Free Shipping',
        weightLb: totalWeight,
        subtotal,
        wholesaleMinimum,
        meetsMinimum: true,
        minimumRemaining: 0,
        isFreeShipping: true,
        freeShippingThreshold,
        amountAwayFromFreeShipping: 0,
        taxAmount,
        taxName,
      };
    }

    if (isDomestic) {
      const normalizedState = normalizeStateCode(dto.state || '');
      const zone = normalizedState ? getZoneForState(normalizedState) ?? undefined : undefined;

      let shippingCost: number;
      let zoneName: string;
      let shippingMethod: string;

      // Zone 8 (AK/HI/DC/PR/VI/GU/MP/AS) is never priced automatically — no
      // shipping cost is computed or charged at all for the whole zone
      // (weight or drum), the customer is told to contact us for a manual
      // quote instead. We don't ship to these destinations through the
      // normal rate tables.
      const isZone8 = zone === 8;

      // A state WAS supplied but maps to no zone — a military/diplomatic
      // mail code (AA/AE/AP, APO/FPO/DPO), or simply a bad value. These must
      // never fall through to the flat fallback amount below: quoting a real
      // price for an address we can't ship to is worse than quoting nothing,
      // so they get the same manual-quote treatment as Zone 8.
      //
      // Distinguished from "no state chosen yet" (normalizedState === ''),
      // which happens on every keystroke while the customer is still filling
      // the address in and must keep its existing behaviour.
      const isUnknownDestination = !!normalizedState && zone == null;

      // Weight-rated (non-drum) items only get a weight-table charge if
      // there's actual non-drum weight — an all-drum cart shouldn't also
      // be charged the 1lb-minimum weight-table row.
      const weightRate =
        zone != null && totalWeight > 0 && !isZone8
          ? await this.shippingRateTiersService.getRate(ShippingRateTierKind.WEIGHT, zone, totalWeight)
          : null;
      const drumRate =
        zone != null && drumCount > 0 && !isZone8
          ? await this.shippingRateTiersService.getRate(ShippingRateTierKind.DRUM, zone, drumCount)
          : null;

      if (isUnknownDestination) {
        shippingCost = 0;
        zoneName = 'Manual quote required';
        shippingMethod = 'Shipping quoted manually — contact us';
      } else if (isZone8) {
        shippingCost = 0;
        zoneName = `Zone ${zone}`;
        shippingMethod = `Standard Shipping - Zone ${zone} — contact us`;
      } else if (weightRate != null || drumRate != null) {
        shippingCost = roundMoney((weightRate ?? 0) + (drumRate ?? 0));
        zoneName = `Zone ${zone}`;
        const parts: string[] = [];
        if (weightRate != null) parts.push(`${totalWeight} lb`);
        if (drumRate != null) parts.push(`${drumCount} drum${drumCount === 1 ? '' : 's'}`);
        shippingMethod = `Standard Shipping - Zone ${zone} (${parts.join(' + ')})`;
      } else {
        const defaultAmount = await this.getDefaultShippingAmount();
        shippingCost = roundMoney(defaultAmount);
        zoneName = 'Default US Shipping';
        shippingMethod = 'Standard Shipping';
      }

      return {
        available: true,
        canShip: true,
        isDomestic: true,
        shippingCost,
        zone,
        zoneName,
        shippingMethod,
        weightLb: totalWeight,
        subtotal,
        wholesaleMinimum,
        meetsMinimum: true,
        minimumRemaining: 0,
        isFreeShipping: false,
        freeShippingThreshold,
        amountAwayFromFreeShipping,
        taxAmount,
        taxName,
        ...(isZone8 || isUnknownDestination ? { carrierNotice: ZONE_8_CARRIER_NOTICE } : {}),
      };
    }

    // International — one flat admin-set amount for every non-US destination.
    const internationalAmount = await this.getInternationalShippingAmount();
    const shippingCost = roundMoney(internationalAmount);

    return {
      available: true,
      canShip: true,
      isDomestic: false,
      shippingCost,
      zoneName: 'International',
      shippingMethod: 'International Shipping',
      weightLb: totalWeight,
      subtotal,
      wholesaleMinimum,
      meetsMinimum: true,
      minimumRemaining: 0,
      isFreeShipping: false,
      freeShippingThreshold,
      amountAwayFromFreeShipping,
      taxAmount,
      taxName,
    };
  }

  // Re-validates a coupon server-side and applies its discount — never trusts
  // a client-sent discount amount. Returns null if no code was provided or it
  // failed validation (checkout still proceeds, just without a discount).
  private async applyCoupon(
    couponCode: string | undefined,
    email: string | undefined,
    subtotal: number,
    cartItems: { productId?: number; variantId?: number; categoryId?: number; quantity: number; price: number }[],
  ) {
    if (!couponCode) return null;
    const result = await this.couponsService.validateCoupon({
      code: couponCode,
      orderAmount: subtotal,
      email,
      cartItems,
    });
    if (!result.isValid || !result.coupon) {
      this.logger.warn(`Coupon "${couponCode}" rejected at checkout: ${result.message}`);
      return null;
    }
    return { couponId: result.coupon.id, couponAmount: result.discountAmount || 0 };
  }

  // Server-side re-validation of the per-variant order limit
  // (limitPerOrder + maxOrderQuantity) — never trust the cart alone, since a
  // race condition or a direct API call could bypass CartService's check.
  // Sums quantities per variant across all line items before comparing,
  // matching the cumulative enforcement used in cart.service.ts.
  private assertOrderLimits(
    lines: { variant: ProductVariant; productName: string; quantity: number }[],
  ) {
    const totalsByVariant = new Map<number, number>();
    for (const line of lines) {
      totalsByVariant.set(
        line.variant.id,
        (totalsByVariant.get(line.variant.id) || 0) + line.quantity,
      );
    }
    const seen = new Set<number>();
    for (const line of lines) {
      const { variant, productName } = line;
      if (seen.has(variant.id)) continue;
      seen.add(variant.id);
      if (!variant.limitPerOrder || variant.maxOrderQuantity == null) continue;
      const total = totalsByVariant.get(variant.id) || 0;
      if (total > variant.maxOrderQuantity) {
        throw new BadRequestException(
          `${productName} (${variant.label}) is limited to ${variant.maxOrderQuantity} units per order. Please reduce the quantity and try again.`,
        );
      }
    }
  }

  // Server-side re-validation of availableFrom — a variant stays browsable on
  // the storefront but can't actually be purchased before this date. Never
  // trust the cart alone, since a race condition or a direct API call could
  // bypass CartService's check.
  private assertAvailability(
    lines: { variant: ProductVariant; productName: string; quantity: number }[],
  ) {
    const now = new Date();
    for (const { variant, productName } of lines) {
      if (!variant.availableFrom || variant.availableFrom <= now) continue;
      const when = variant.availableFrom.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      throw new BadRequestException(
        `${productName} (${variant.label}) isn't available for purchase yet — it becomes available on ${when}.`,
      );
    }
  }

  // Reserves inventory at order-placement time (not payment confirmation) —
  // matches assertAvailability/assertOrderLimits already gating on the same
  // snapshot of stock right before the order is created. Variants with no
  // stockQuantity tracked (null = unlimited) are left untouched. Clamped at
  // 0 rather than going negative, and flips stockStatus to OUT_OF_STOCK the
  // same way resolveStockStatus (products.service.ts) derives it elsewhere,
  // so the storefront immediately reflects the new stock level.
  private async decrementStock(lines: { variant: ProductVariant; quantity: number }[]) {
    for (const { variant, quantity } of lines) {
      if (variant.stockQuantity == null) continue;
      const remaining = Math.max(variant.stockQuantity - quantity, 0);
      await this.variantsRepo.update(variant.id, {
        stockQuantity: remaining,
        ...(remaining <= 0 && variant.stockStatus !== StockStatus.ON_BACKORDER
          ? { stockStatus: StockStatus.OUT_OF_STOCK }
          : {}),
      });
    }
  }

  /**
   * Puts inventory back when an order is cancelled — the missing counterpart
   * to decrementStock().
   *
   * Without this, cancelling an order for 5 units left those 5 units gone
   * from inventory forever, and any variant that the order had pushed to
   * OUT_OF_STOCK stayed out of stock with real units on the shelf.
   *
   * Mirrors decrementStock's rules exactly:
   *  - variants with stockQuantity null (untracked/unlimited) are skipped
   *  - ON_BACKORDER is left alone; that is a deliberate admin state, not a
   *    consequence of stock hitting zero
   * Only lifts OUT_OF_STOCK back to IN_STOCK, so a variant an admin set to
   * some other status isn't overwritten by a cancellation.
   */
  private async restoreStock(items: OrderItem[], manager?: EntityManager) {
    const repo = manager ? manager.getRepository(ProductVariant) : this.variantsRepo;

    const variantIds = (items || [])
      .map((i) => i.productVariantId)
      .filter((id): id is number => id != null);
    if (variantIds.length === 0) return;

    const variants = await repo.find({ where: { id: In(variantIds) } });
    const byId = new Map(variants.map((v) => [v.id, v]));

    // Summed per variant first: an order can legitimately carry the same
    // variant on more than one line, and updating per line would only
    // restore the last one.
    const quantityByVariant = new Map<number, number>();
    for (const item of items || []) {
      if (item.productVariantId == null) continue;
      quantityByVariant.set(
        item.productVariantId,
        (quantityByVariant.get(item.productVariantId) || 0) + item.quantity,
      );
    }

    for (const [variantId, quantity] of quantityByVariant) {
      const variant = byId.get(variantId);
      // Variant deleted since the order was placed — nothing to restore to.
      if (!variant || variant.stockQuantity == null) continue;

      const restored = variant.stockQuantity + quantity;
      await repo.update(variantId, {
        stockQuantity: restored,
        ...(restored > 0 && variant.stockStatus === StockStatus.OUT_OF_STOCK
          ? { stockStatus: StockStatus.IN_STOCK }
          : {}),
      });
      this.logger.log(
        `Variant #${variantId} stock restored ${variant.stockQuantity} -> ${restored} (cancelled order).`,
      );
    }
  }

  findAllForUser(userId: number) {
    return this.ordersRepo.find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: number, id: number) {
    const order = await this.ordersRepo.findOne({ where: { id, userId }, relations: ['items'] });
    if (!order) throw new NotFoundException(`Order #${id} not found`);
    return order;
  }

  // No Order row is created here — only once Stripe confirms payment (see
  // finalizeCheckoutFromPendingId, called from WebhooksService). This method
  // validates everything, snapshots the cart into a PendingCheckout row, and
  // hands the customer off to Stripe. If they never pay, or payment fails,
  // nothing was ever "ordered": no phantom PENDING order, no stock
  // decremented, no cart cleared, no coupon usage counted.
  async checkout(userId: number | null, dto: CheckoutDto) {
    const { shippingAddress, notes } = dto;

    if (userId) {
      // Logged-in checkout: pulls from the server-side DB cart (left
      // untouched here — only cleared once payment is confirmed).
      const cart = await this.cartRepo.findOne({
        where: { userId },
        relations: ['items', 'items.variant', 'items.variant.product'],
      });
      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Your cart is empty — add some items before checking out.');
      }

      const cartLines = cart.items.map((item) => ({
        variant: item.variant,
        productName: item.variant.product?.name || item.variant.label,
        quantity: item.quantity,
      }));
      this.assertAvailability(cartLines);
      this.assertOrderLimits(cartLines);

      const itemSnapshots: PendingCheckoutItemSnapshot[] = cart.items.map((item) => ({
        productVariantId: item.productVariantId,
        productName: item.variant.product?.name || '',
        variantLabel: item.variant.label,
        sku: item.variant.sku,
        imageUrl: item.variant.imageUrl || item.variant.product?.imageUrl || null,
        quantity: item.quantity,
        price: item.price,
        purchaseType: item.purchaseType,
      }));

      const subtotal = itemSnapshots.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

      const user = await this.usersService.findById(userId);
      const cartItemsForCoupon = cart.items.map((item) => ({
        productId: item.variant.product?.id,
        variantId: item.productVariantId,
        categoryId: item.variant.product?.categoryId,
        quantity: item.quantity,
        price: Number(item.price),
      }));
      const couponResult = await this.applyCoupon(dto.couponCode, user.email, subtotal, cartItemsForCoupon);
      const shippingCost = dto.shippingCost ?? 0;
      const taxAmount = await this.computeTax(subtotal);

      const pending = await this.pendingCheckoutsRepo.save(
        this.pendingCheckoutsRepo.create({
          userId,
          itemsJson: JSON.stringify(itemSnapshots),
          subtotal: subtotal.toFixed(2),
          shippingCost: shippingCost.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          couponId: couponResult?.couponId ?? null,
          couponAmount: (couponResult?.couponAmount || 0).toFixed(2),
          shippingAddress,
          notes,
        }),
      );

      const session = await this.stripeService.createCheckoutSession({
        pendingCheckoutId: pending.id,
        items: itemSnapshots,
        shippingCost,
        taxAmount,
        couponAmount: couponResult?.couponAmount || 0,
      });
      this.logger.log(
        `Checkout session created for user ${userId} (pendingCheckout #${pending.id}) — awaiting payment.`,
      );
      return { checkoutUrl: session.url };
    }

    // Guest checkout: no DB cart exists — items come straight from the request body.
    if (!dto.guestEmail || !dto.guestName) {
      throw new BadRequestException('Email and name are required to check out as a guest.');
    }
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Your cart is empty.');
    }

    const variantIds = dto.items.map((i) => i.productVariantId);
    const variants = await this.variantsRepo.find({
      where: { id: In(variantIds) },
      relations: ['product'],
    });
    const variantsById = new Map(variants.map((v) => [v.id, v]));

    for (const reqItem of dto.items) {
      if (!variantsById.has(reqItem.productVariantId)) {
        throw new BadRequestException(
          `One of the items in your cart (variant #${reqItem.productVariantId}) is no longer available. Please remove it and try again.`,
        );
      }
    }

    const guestLines = dto.items.map((reqItem) => {
      const variant = variantsById.get(reqItem.productVariantId)!;
      return {
        variant,
        productName: variant.product?.name || variant.label,
        quantity: reqItem.quantity,
      };
    });
    this.assertAvailability(guestLines);
    this.assertOrderLimits(guestLines);

    const itemSnapshots: PendingCheckoutItemSnapshot[] = dto.items.map((reqItem) => {
      const variant = variantsById.get(reqItem.productVariantId)!;
      return {
        productVariantId: variant.id,
        productName: variant.product?.name || '',
        variantLabel: variant.label,
        sku: variant.sku,
        imageUrl: variant.imageUrl || variant.product?.imageUrl || null,
        quantity: reqItem.quantity,
        price: getEffectivePrice(variant),
      };
    });

    const subtotal = itemSnapshots.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

    const cartItemsForCoupon = dto.items.map((reqItem) => {
      const variant = variantsById.get(reqItem.productVariantId);
      return {
        productId: variant?.product?.id,
        variantId: reqItem.productVariantId,
        categoryId: variant?.product?.categoryId,
        quantity: reqItem.quantity,
        price: Number(getEffectivePrice(variant as ProductVariant)),
      };
    });
    const couponResult = await this.applyCoupon(dto.couponCode, dto.guestEmail, subtotal, cartItemsForCoupon);
    const shippingCost = dto.shippingCost ?? 0;
    const taxAmount = await this.computeTax(subtotal);

    // Account creation isn't gated on payment — it's not "an order", just an
    // account, and creating it now lets the customer be logged in through
    // the Stripe redirect. Ties the pending checkout (and eventually the
    // real order) to the new account.
    let accessToken: string | undefined;
    let linkedUserId: number | null = null;

    if (dto.createAccount) {
      if (!dto.password) {
        this.logger.warn(
          `Skipped account creation for guest checkout by ${dto.guestEmail} — createAccount was true but no password was provided.`,
        );
      } else {
        const existing = await this.usersService.findByEmail(dto.guestEmail);
        if (existing) {
          this.logger.log(
            `Skipped account creation for guest checkout — email ${dto.guestEmail} is already registered.`,
          );
        } else {
          const passwordHash = await bcrypt.hash(dto.password, 10);
          const newUser = await this.usersService.create({
            email: dto.guestEmail,
            passwordHash,
            fullName: dto.guestName,
            phone: dto.guestPhone,
          });
          linkedUserId = newUser.id;
          accessToken = this.jwtService.sign({
            sub: newUser.id,
            email: newUser.email,
            role: newUser.role,
          });
          this.logger.log(`Account created from guest checkout: ${newUser.email} (id=${newUser.id}).`);
        }
      }
    }

    const pending = await this.pendingCheckoutsRepo.save(
      this.pendingCheckoutsRepo.create({
        userId: linkedUserId,
        guestEmail: dto.guestEmail,
        guestName: dto.guestName,
        guestPhone: dto.guestPhone ?? null,
        itemsJson: JSON.stringify(itemSnapshots),
        subtotal: subtotal.toFixed(2),
        shippingCost: shippingCost.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        couponId: couponResult?.couponId ?? null,
        couponAmount: (couponResult?.couponAmount || 0).toFixed(2),
        shippingAddress,
        notes,
      }),
    );

    const session = await this.stripeService.createCheckoutSession({
      pendingCheckoutId: pending.id,
      items: itemSnapshots,
      shippingCost,
      taxAmount,
      couponAmount: couponResult?.couponAmount || 0,
    });
    this.logger.log(
      `Guest checkout session created for ${dto.guestEmail} (pendingCheckout #${pending.id}) — awaiting payment.`,
    );

    return { checkoutUrl: session.url, accessToken };
  }

  // Called from WebhooksService once Stripe confirms a Checkout Session was
  // paid — this is the ONLY place an Order gets created for a Stripe
  // checkout. Turns the snapshot back into real OrderItems, decrements
  // stock, clears the DB cart (logged-in) and counts coupon usage — none of
  // which happened at checkout() time. Idempotent: returns null if the
  // pending checkout is gone (already finalized or expired/cleaned up) so a
  // duplicate webhook delivery is a safe no-op; the caller should also check
  // for an existing Order by stripeCheckoutSessionId first.
  async finalizeCheckoutFromPendingId(
    pendingCheckoutId: number,
    stripeCheckoutSessionId: string,
    stripePaymentIntentId?: string | null,
  ): Promise<Order | null> {
    const pending = await this.pendingCheckoutsRepo.findOne({ where: { id: pendingCheckoutId } });
    if (!pending) return null;

    const itemSnapshots: PendingCheckoutItemSnapshot[] = JSON.parse(pending.itemsJson);
    const orderItems = itemSnapshots.map((item) =>
      this.orderItemsRepo.create({
        productVariantId: item.productVariantId,
        productName: item.productName,
        variantLabel: item.variantLabel,
        sku: item.sku,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
        price: item.price,
        purchaseType: item.purchaseType,
      }),
    );

    const subtotal = Number(pending.subtotal);
    const shippingCost = Number(pending.shippingCost);
    const taxAmount = Number(pending.taxAmount);
    const couponAmount = Number(pending.couponAmount);
    const total = subtotal - couponAmount + shippingCost + taxAmount;

    let order = this.ordersRepo.create({
      userId: pending.userId,
      guestEmail: pending.userId ? null : pending.guestEmail,
      guestName: pending.userId ? null : pending.guestName,
      guestPhone: pending.userId ? null : pending.guestPhone,
      status: OrderStatus.PENDING,
      items: orderItems,
      subtotal: subtotal.toFixed(2),
      total: total.toFixed(2),
      couponId: pending.couponId,
      couponAmount: couponAmount.toFixed(2),
      shippingCost: shippingCost.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      shippingAddress: pending.shippingAddress,
      notes: pending.notes,
      stripeCheckoutSessionId,
      stripePaymentIntentId: stripePaymentIntentId ?? null,
    });
    order = await this.ordersRepo.save(order);

    const variantIds = itemSnapshots.map((i) => i.productVariantId);
    const variants = await this.variantsRepo.find({ where: { id: In(variantIds) } });
    const variantsById = new Map(variants.map((v) => [v.id, v]));
    await this.decrementStock(
      itemSnapshots
        .filter((item) => variantsById.has(item.productVariantId))
        .map((item) => ({ variant: variantsById.get(item.productVariantId)!, quantity: item.quantity })),
    );

    if (pending.userId) {
      const cart = await this.cartRepo.findOne({ where: { userId: pending.userId }, relations: ['items'] });
      if (cart && cart.items.length) {
        await this.cartRepo.manager.remove(cart.items);
      }
    }

    if (pending.couponId) {
      const email = pending.userId
        ? (await this.usersService.findById(pending.userId)).email
        : pending.guestEmail || '';
      await this.couponsService.incrementUsage(pending.couponId, email, order.id);
    }

    await this.pendingCheckoutsRepo.remove(pending);

    this.logger.log(
      `Order #${order.id} created from pendingCheckout #${pendingCheckoutId} after Stripe payment confirmation — total $${order.total}.`,
    );
    return order;
  }

  // Backstop for abandoned Stripe Checkout Sessions (customer never returns,
  // or the session simply expires — Stripe's default is 24h) — deletes
  // pending checkouts older than a day so this table doesn't grow forever.
  // Nothing sensitive is lost: no order, no stock movement, no coupon usage
  // was ever created for these.
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupAbandonedPendingCheckouts(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await this.pendingCheckoutsRepo.delete({ createdAt: LessThan(cutoff) });
    if (result.affected) {
      this.logger.log(`Cleaned up ${result.affected} abandoned pending checkout(s) older than 24h.`);
    }
  }

  // Admin/sales view: every order, joined to the placing user and their company,
  // with optional status filter — for an orders-management dashboard.
  async findAllAdmin(status?: OrderStatus, page = 1, limit = 20) {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('user.company', 'company')
      .orderBy('order.createdAt', 'DESC');

    if (status) qb.andWhere('order.status = :status', { status });

    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // Backs the guest-vs-customer stat cards atop the admin Orders page.
  // "Customer" here means the order is linked to a real account (userId set)
  // — guest checkout never creates an order with a userId, even when the
  // guest also opted to create an account afterward (that only sets
  // userId retroactively on that SAME order, so it still ends up counted
  // as customer once linked).
  async getAdminStats() {
    const [total, customerOrders, guestOrders] = await Promise.all([
      this.ordersRepo.count(),
      this.ordersRepo.count({ where: { userId: Not(IsNull()) } }),
      this.ordersRepo.count({ where: { userId: IsNull() } }),
    ]);
    return { total, customerOrders, guestOrders };
  }

  /**
   * Whether a customer may still cancel this order themselves.
   *
   * The decisive fact is the LABEL, not the status: once
   * createShipmentForOrder buys one we have spent real carrier money and the
   * parcel may already be moving, so it becomes a return rather than a
   * cancellation. An order sits in PROCESSING both before and after the
   * label is bought, which is why this checks `trackingNumber` rather than
   * trusting the status alone.
   *
   * Returns a reason (not just false) so the UI can explain why the button
   * is disabled instead of leaving a dead control on screen.
   */
  static customerCancelEligibility(order: Pick<Order, 'status' | 'trackingNumber'>): {
    canCancel: boolean;
    reason?: string;
  } {
    switch (order.status) {
      case OrderStatus.CANCELLED:
        return { canCancel: false, reason: 'This order is already cancelled.' };
      case OrderStatus.DELIVERED:
        return {
          canCancel: false,
          reason: 'This order has already been delivered. Please contact us to arrange a return.',
        };
      case OrderStatus.SHIPPED:
        return {
          canCancel: false,
          reason: 'This order has already shipped. Please contact us to arrange a return.',
        };
      case OrderStatus.PENDING:
        return { canCancel: true };
      case OrderStatus.PROCESSING:
        return order.trackingNumber
          ? {
              canCancel: false,
              reason:
                'A shipping label has already been purchased for this order. Please contact us to arrange a return.',
            }
          : { canCancel: true };
      default:
        // Unknown/new status: refuse rather than guess. Cancelling runs
        // refunds and restocks, so the safe default is "no".
        return { canCancel: false, reason: 'This order can no longer be cancelled online. Please contact us.' };
    }
  }

  /**
   * Customer-initiated cancellation.
   *
   * Ownership is enforced by loading with `userId` in the where clause, so
   * one customer can never cancel another's order — a 404 rather than a 403,
   * matching findOne and avoiding confirming that the order exists.
   *
   * Delegates to updateStatus once eligible, so a customer cancellation and
   * an admin cancellation run exactly the same side effects (restock, coupon
   * rollback, customer email, refund-required alert). Duplicating that here
   * would be the obvious way for the two paths to drift apart.
   */
  async cancelByCustomer(userId: number, orderId: number) {
    const order = await this.ordersRepo.findOne({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);

    const { canCancel, reason } = OrdersService.customerCancelEligibility(order);
    if (!canCancel) {
      this.logger.warn(
        `User #${userId} tried to cancel order #${orderId} (status ${order.status}, tracking ${
          order.trackingNumber || 'none'
        }) — refused: ${reason}`,
      );
      throw new BadRequestException(reason);
    }

    this.logger.log(`Order #${orderId} cancelled by customer (user #${userId}).`);
    return this.updateStatus(orderId, OrderStatus.CANCELLED);
  }

  async updateStatus(id: number, status: OrderStatus) {
    const order = await this.ordersRepo.findOne({ where: { id }, relations: ['items', 'user'] });
    if (!order) throw new NotFoundException(`Order #${id} not found`);
    const previousStatus = order.status;

    // Guarded on the TRANSITION, not the target status, so re-saving an
    // already-cancelled order can never restock or refund a second time.
    const isNewCancellation =
      status === OrderStatus.CANCELLED && previousStatus !== OrderStatus.CANCELLED;

    let saved: Order;

    if (isNewCancellation) {
      // Status, stock and coupon usage move together: a partial run would
      // leave a cancelled order whose inventory was never returned, or
      // inventory returned for an order still showing as active.
      saved = await this.ordersRepo.manager.transaction(async (manager) => {
        order.status = status;
        const persisted = await manager.save(order);
        await this.restoreStock(order.items || [], manager);
        return persisted;
      });

      // Deliberately outside the transaction: it writes through
      // CouponsService's own repositories, and a coupon-rollback failure
      // must not roll back the cancellation itself. Logged loudly instead.
      try {
        await this.couponsService.revokeUsageForOrder(order.id);
      } catch (err) {
        this.logger.error(
          `Order #${id} was cancelled but its coupon usage could NOT be revoked — ` +
            `the customer's allowance is still consumed, fix by hand: ${err instanceof Error ? err.message : err}`,
        );
      }
    } else {
      order.status = status;
      saved = await this.ordersRepo.save(order);
    }

    this.logger.log(`Order #${id} status changed: ${previousStatus} -> ${status}`);

    if (isNewCancellation) {
      try {
        await this.emailService.sendOrderCancelledEmail(saved);
      } catch (err) {
        this.logger.warn(
          `Order cancellation email threw unexpectedly for order #${id}: ${err instanceof Error ? err.message : err}`,
        );
      }

      // Separate internal email, because no code here issues a Stripe
      // refund — the customer has just been promised their money back, so
      // somebody has to actually send it. Only fires when a payment was
      // really captured.
      if (saved.stripePaymentIntentId) {
        try {
          await this.emailService.sendRefundRequiredInternalNotification(saved);
        } catch (err) {
          this.logger.error(
            `Refund-required notification FAILED for order #${id} — a refund is owed and nobody has been told: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      }
    }

    // Strip passwordHash before this reaches a client — the `user` relation
    // was only added here to build the cancellation email, and loads the
    // full User row, hash included.
    if (saved.user) {
      const { passwordHash, ...safeUser } = saved.user;
      saved.user = safeUser as typeof saved.user;
    }
    return saved;
  }

  async updateTracking(id: number, dto: UpdateTrackingDto) {
    const order = await this.ordersRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order #${id} not found`);
    applyTrackingNumber(order, dto.trackingNumber, dto.carrierCode);
    const saved = await this.ordersRepo.save(order);
    this.logger.log(
      `Order #${id} tracking info set: carrier=${dto.carrierCode} trackingNumber=${dto.trackingNumber}`,
    );
    return saved;
  }

  /**
   * Buys a Shippo shipping label for an order right after payment capture and
   * records the tracking number it returns. Shippo is the sole shipping
   * provider — it creates the shipment, buys the label, returns the tracking
   * number and (via the /tracks subscription made inside ShippoService)
   * pushes the tracking updates that advance order status.
   *
   * The HTTP mechanics now live in ShippoService; this method's job is the
   * order-side work: load what Shippo needs, persist the result, and stay
   * silent-but-honest when it can't be done.
   *
   * Never throws and never fabricates a tracking number — if Shippo isn't
   * configured or refuses the shipment, the order simply has no tracking yet,
   * which is the truthful state.
   */
  async createShipmentForOrder(orderId: number): Promise<void> {
    // Items are needed for the parcel weight, user for the recipient name —
    // the previous bare findOne loaded neither, which is part of why the
    // parcel had to be hardcoded.
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['items', 'user'],
    });
    if (!order) {
      this.logger.warn(`createShipmentForOrder: order #${orderId} not found — skipping.`);
      return;
    }

    // Real per-variant weights, so the label is rated on what was actually
    // bought rather than a hardcoded 1lb.
    const variantIds = (order.items || [])
      .map((item) => item.productVariantId)
      .filter((id): id is number => id != null);
    const variants = variantIds.length
      ? await this.variantsRepo.find({ where: { id: In(variantIds) } })
      : [];
    const variantsById = new Map(variants.map((v) => [v.id, v]));

    const result = await this.shippoService.purchaseLabelForOrder(order, variantsById);
    if (!result.purchased) {
      // ShippoService already logged the specific reason.
      return;
    }

    applyTrackingNumber(order, result.trackingNumber, result.carrier);
    await this.ordersRepo.save(order);
    this.logger.log(
      `Order #${orderId} shipment created via Shippo: carrier=${result.carrier} trackingNumber=${result.trackingNumber}`,
    );
  }

  /* ------------------------------------------------------------------------
   * ShipStation — DISABLED.
   *
   * Shippo is now the sole shipping provider. ShipStation is commented out
   * rather than deleted so it can be restored if that decision changes; the
   * module, service and DTOs are all still in the tree.
   *
   * Why it was replaced: ShipStation's V2 API (the generation our key is for)
   * only creates a shipment RECORD — `POST /v2/shipments` returns a
   * shipment_id and never a tracking number. Buying the label is a separate
   * `POST /v2/labels` call that was never implemented, so this push produced
   * no tracking number and no label. Shippo does the whole flow in one pass.
   *
   * To restore: uncomment this method, re-add ShipStationModule to
   * orders.module.ts and the constructor injection below, and uncomment the
   * call in WebhooksService.handleStripeEvent.
   *
   * async pushOrderToShipStation(orderId: number): Promise<void> {
   *   const order = await this.ordersRepo.findOne({
   *     where: { id: orderId },
   *     relations: ['items', 'user'],
   *   });
   *   if (!order) {
   *     this.logger.warn(`pushOrderToShipStation: order #${orderId} not found — skipping.`);
   *     return;
   *   }
   *   if (order.shipstationOrderId) {
   *     this.logger.warn(
   *       `Order #${orderId} already has a ShipStation order id (${order.shipstationOrderId}) — skipping duplicate push.`,
   *     );
   *     return;
   *   }
   *   try {
   *     const shipstationOrderId = await this.shipStationService.createOrder(order);
   *     if (!shipstationOrderId) return;
   *     order.shipstationOrderId = shipstationOrderId;
   *     await this.ordersRepo.save(order);
   *     this.logger.log(`Order #${orderId} shipstationOrderId persisted: ${shipstationOrderId}`);
   *   } catch (err) {
   *     this.logger.warn(
   *       `ShipStation push threw unexpectedly for order #${orderId}: ${err instanceof Error ? err.message : err}`,
   *     );
   *   }
   * }
   * --------------------------------------------------------------------- */

  private async maybeAdvanceStatus(order: Order, shippoStatus: string) {
    const target = computeAdvancedOrderStatus(order.status, shippoStatus);
    if (!target) return;

    const previousStatus = order.status;
    order.status = target;
    await this.ordersRepo.save(order);
    this.logger.log(
      `Order #${order.id} status auto-advanced via Shippo tracking: ${previousStatus} -> ${target}`,
    );
  }

  /**
   * On-demand tracking for the customer/admin timeline.
   *
   * The Shippo HTTP call and its response mapping now live in ShippoService;
   * what stays here is the order lookup, the not-shipped-yet short-circuit,
   * and the status auto-advance.
   *
   * The status advance stays on this read path deliberately: Shippo only
   * pushes `track_updated` webhooks for tracking numbers registered via
   * POST /tracks, so for any shipment created before that subscription
   * existed this lookup is the only thing that moves status. It is
   * forward-only (computeAdvancedOrderStatus), so it can never regress an
   * order or resurrect a cancelled one.
   */
  /**
   * Public guest tracking lookup: order id + the email that placed it.
   *
   * Security notes, since this is the only unauthenticated read of order data:
   *  - Matching on email is what makes an id-only walk useless. Compared
   *    case-insensitively because checkout does not normalize case, so a
   *    customer who typed "Dexter@..." must still be able to look it up.
   *  - Guest orders match on `guestEmail`; a registered user's order matches
   *    on their account email too, so someone who ordered while logged in
   *    can still track without signing in (they have the same two facts).
   *  - A wrong email and a non-existent order return the SAME NotFound, so
   *    this can't be used to discover which order ids or emails exist.
   *  - Returns a deliberately narrow projection — status, dates, totals,
   *    items and tracking. No addresses, no phone, no user id, no Stripe
   *    ids: enough to answer "where is my order", nothing that would make
   *    this worth attacking.
   */
  async trackAsGuest(orderId: number, email: string) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['items', 'user'],
    });

    const supplied = email.trim().toLowerCase();
    const matches =
      !!order &&
      [order.guestEmail, order.user?.email]
        .filter((e): e is string => !!e)
        .some((e) => e.toLowerCase() === supplied);

    if (!order || !matches) {
      // Same message either way — see the note above.
      this.logger.warn(`Guest tracking lookup failed for order #${orderId} (email mismatch or no such order).`);
      throw new NotFoundException('No order found with that order number and email address.');
    }

    const tracking = await this.getTrackingCheckpoints(order.id);

    return {
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      total: order.total,
      trackingNumber: order.trackingNumber,
      carrierCode: order.carrierCode,
      items: (order.items || []).map((i) => ({
        id: i.id,
        productName: i.productName,
        variantLabel: i.variantLabel,
        sku: i.sku,
        quantity: i.quantity,
        price: i.price,
      })),
      tracking,
    };
  }

  async getTrackingCheckpoints(orderId: number): Promise<TrackingResult> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);

    if (!order.trackingNumber || !order.carrierCode) {
      return { available: false, reason: 'not_shipped_yet' };
    }

    const result = await this.shippoService.getTracking(order.carrierCode, order.trackingNumber);

    if (result.available) {
      await this.maybeAdvanceStatus(order, result.currentStatus);
      return result;
    }

    // Live lookup failed, but we still know the number and carrier — hand
    // them back so the UI can show them and link to the carrier's own
    // tracking page instead of a bare "unavailable" message.
    return { ...result, carrier: order.carrierCode, trackingNumber: order.trackingNumber };
  }

}
