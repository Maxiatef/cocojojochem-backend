import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { In, IsNull, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import { Cart, Order, OrderItem, OrderStatus, ProductVariant, ShippingRateTierKind, StockStatus } from '../../entities';
import { getEffectivePrice } from '../../common/pricing.util';
import { UsersService } from '../users/users.service';
import { CouponsService } from '../coupons/coupons.service';
import { StripeService } from '../stripe/stripe.service';
import { CheckoutDto } from './dto/checkout.dto';
import { ShippingEstimateDto } from './dto/shipping-estimate.dto';
import { CarrierCode, UpdateTrackingDto } from './dto/update-tracking.dto';
import { SiteSettingsService } from '../site-settings/site-settings.service';
import { ShipStationService } from '../shipstation/shipstation.service';
import { ShippingRateTiersService } from '../shipping-rate-tiers/shipping-rate-tiers.service';
import { EmailService } from '../email/email.service';
import { getZoneForState, normalizeStateCode } from './shipping-zones.constants';
import { FREE_SHIPPING_THRESHOLD, isUnitedStates, roundMoney } from './shipping-rates.constants';

const DEFAULT_WHOLESALE_MINIMUM = 250;

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
  // Advisory only — never blocks checkout. Shown for a drum-flagged item
  // shipping to Zone 8 (HI/AS/GU/MP/AP): no drum shipping cost is computed
  // or charged for that portion of the order — the customer is told to
  // contact us for a manual quote instead.
  carrierNotice?: string;
}

const ZONE_8_DRUM_CARRIER_NOTICE = 'For shipping cost, please contact us.';

interface ShippoLocation {
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

interface ShippoTrackingHistoryEntry {
  status: string;
  status_details?: string;
  status_date?: string;
  location?: ShippoLocation;
}

export interface ShippoTrackingResponse {
  carrier: string;
  tracking_number: string;
  tracking_status?: ShippoTrackingHistoryEntry;
  tracking_history?: ShippoTrackingHistoryEntry[];
  eta?: string | null;
}

export interface TrackingCheckpoint {
  status: string;
  description: string;
  location: string | null;
  timestamp: string;
}

export type TrackingResult =
  | { available: false; reason: 'not_shipped_yet' | 'tracking_not_configured' | 'lookup_failed' }
  | {
      available: true;
      carrier: string;
      trackingNumber: string;
      currentStatus: string;
      eta: string | null;
      checkpoints: TrackingCheckpoint[];
    };

// Order in which statuses become "reached" — used so a stale/conflicting
// Shippo read can never move an order's status backward.
export const ORDER_STATUS_RANK: Record<string, number> = {
  [OrderStatus.PENDING]: 0,
  [OrderStatus.PROCESSING]: 1,
  [OrderStatus.SHIPPED]: 2,
  [OrderStatus.DELIVERED]: 3,
  [OrderStatus.CANCELLED]: -1,
};

/**
 * Pure mapping from a Shippo tracking status string to the internal
 * OrderStatus it should advance an order to, mirroring the real
 * cocojojo.com site's ShippoService.handleTrackingUpdate switch
 * (shippo.service.ts:1303-1337), except that our schema has a distinct
 * DELIVERED status (the real site collapses everything post-shipment into
 * SHIPPED), so DELIVERED is mapped onto our own DELIVERED status instead.
 *
 * Returns null when the status shouldn't move the order forward at all
 * (PRE_TRANSIT, RETURNED, FAILURE, UNKNOWN, or anything unrecognized) —
 * matching the real site's no-op behavior for those cases.
 */
export function mapShippoStatusToTargetOrderStatus(shippoStatus: string | undefined | null): OrderStatus | null {
  switch (shippoStatus) {
    case 'DELIVERED':
      return OrderStatus.DELIVERED;
    case 'TRANSIT':
    case 'OUT_FOR_DELIVERY':
    case 'PICKUP':
      return OrderStatus.SHIPPED;
    case 'PRE_TRANSIT':
    case 'RETURNED':
    case 'FAILURE':
    case 'UNKNOWN':
    default:
      return null;
  }
}

/**
 * Pure, side-effect-free computation of what an order's status should
 * become given its current status and a raw Shippo tracking status string.
 * Returns the new OrderStatus if it should advance, or null if no change
 * should be made (target status unmapped, order cancelled, or the target
 * would not be a forward move per ORDER_STATUS_RANK).
 */
export function computeAdvancedOrderStatus(
  currentStatus: OrderStatus,
  shippoStatus: string | undefined | null,
): OrderStatus | null {
  const target = mapShippoStatusToTargetOrderStatus(shippoStatus);
  if (!target) return null;
  if (currentStatus === OrderStatus.CANCELLED) return null; // never override a cancelled order

  const currentRank = ORDER_STATUS_RANK[currentStatus] ?? 0;
  const targetRank = ORDER_STATUS_RANK[target] ?? 0;
  if (targetRank > currentRank) return target;
  return null;
}

/**
 * Pure mapping from a raw Shippo REST tracking-poll response
 * (`GET /tracks/{carrier}/{tracking_number}`) into our checkpoint shape.
 * No network calls — safe to unit test directly.
 */
export function mapShippoTrackingResponseToCheckpoints(
  data: ShippoTrackingResponse | null | undefined,
): { currentStatus: string; checkpoints: TrackingCheckpoint[] } | null {
  if (!data || !data.tracking_status || !data.tracking_status.status) {
    return null;
  }

  const currentStatus = data.tracking_status.status;
  const checkpoints: TrackingCheckpoint[] = (data.tracking_history || [])
    .map((entry) => ({
      status: entry.status,
      description: entry.status_details || '',
      location: formatShippoLocation(entry.location),
      timestamp: entry.status_date || '',
    }))
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  return { currentStatus, checkpoints };
}

function formatShippoLocation(location?: ShippoLocation): string | null {
  if (!location) return null;
  const parts = [location.city, location.state, location.country].filter((p) => !!p);
  return parts.length ? parts.join(', ') : null;
}

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
    private readonly usersService: UsersService,
    private readonly couponsService: CouponsService,
    private readonly jwtService: JwtService,
    private readonly stripeService: StripeService,
    private readonly siteSettingsService: SiteSettingsService,
    private readonly shipStationService: ShipStationService,
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
      };
    }

    if (isDomestic) {
      const normalizedState = normalizeStateCode(dto.state || '');
      const zone = normalizedState ? getZoneForState(normalizedState) ?? undefined : undefined;

      let shippingCost: number;
      let zoneName: string;
      let shippingMethod: string;

      // Zone 8 (HI/AS/GU/MP/AP) drums are never priced automatically — no
      // cost is computed or charged for the drum portion of the order, the
      // customer is told to contact us for a manual quote instead.
      const isZone8Drums = zone === 8 && drumCount > 0;

      // Weight-rated (non-drum) items only get a weight-table charge if
      // there's actual non-drum weight — an all-drum cart shouldn't also
      // be charged the 1lb-minimum weight-table row.
      const weightRate =
        zone != null && totalWeight > 0
          ? await this.shippingRateTiersService.getRate(ShippingRateTierKind.WEIGHT, zone, totalWeight)
          : null;
      const drumRate =
        zone != null && drumCount > 0 && !isZone8Drums
          ? await this.shippingRateTiersService.getRate(ShippingRateTierKind.DRUM, zone, drumCount)
          : null;

      if (weightRate != null || drumRate != null || isZone8Drums) {
        shippingCost = roundMoney((weightRate ?? 0) + (drumRate ?? 0));
        zoneName = `Zone ${zone}`;
        const parts: string[] = [];
        if (weightRate != null) parts.push(`${totalWeight} lb`);
        if (drumRate != null) parts.push(`${drumCount} drum${drumCount === 1 ? '' : 's'}`);
        if (isZone8Drums) parts.push(`${drumCount} drum${drumCount === 1 ? '' : 's'} — contact us`);
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
        ...(isZone8Drums ? { carrierNotice: ZONE_8_DRUM_CARRIER_NOTICE } : {}),
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

  async checkout(userId: number | null, dto: CheckoutDto) {
    const { shippingAddress, notes } = dto;

    let order: Order;

    if (userId) {
      // Logged-in checkout: unchanged behavior — pulls from the server-side DB cart.
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

      const orderItems = cart.items.map((item) =>
        this.orderItemsRepo.create({
          productVariantId: item.productVariantId,
          productName: item.variant.product?.name || '',
          variantLabel: item.variant.label,
          sku: item.variant.sku,
          imageUrl: item.variant.imageUrl || item.variant.product?.imageUrl || null,
          quantity: item.quantity,
          price: item.price,
          purchaseType: item.purchaseType,
        }),
      );

      const subtotal = orderItems.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0,
      );

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
      const total = subtotal - (couponResult?.couponAmount || 0) + shippingCost;

      order = this.ordersRepo.create({
        userId,
        status: OrderStatus.PENDING,
        items: orderItems,
        subtotal: subtotal.toFixed(2),
        total: total.toFixed(2),
        couponId: couponResult?.couponId ?? null,
        couponAmount: (couponResult?.couponAmount || 0).toFixed(2),
        shippingCost: shippingCost.toFixed(2),
        shippingAddress,
        notes,
      });

      order = await this.ordersRepo.save(order);
      await this.decrementStock(cartLines);
      await this.cartRepo.manager.remove(cart.items);
      if (couponResult) {
        await this.couponsService.incrementUsage(couponResult.couponId, user.email, order.id);
      }
      this.logger.log(
        `Order placed: #${order.id} by user ${userId} — ${orderItems.length} item(s), total $${order.total}`,
      );

      const session = await this.stripeService.createCheckoutSession(order);
      order.stripePaymentIntentId = session.payment_intent as string;
      await this.ordersRepo.save(order);
      return { order, checkoutUrl: session.url };
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

    const orderItems = dto.items.map((reqItem) => {
      const variant = variantsById.get(reqItem.productVariantId);
      if (!variant) {
        throw new BadRequestException(`Product variant #${reqItem.productVariantId} not found`);
      }
      return this.orderItemsRepo.create({
        productVariantId: variant.id,
        productName: variant.product?.name || '',
        variantLabel: variant.label,
        sku: variant.sku,
        imageUrl: variant.imageUrl || variant.product?.imageUrl || null,
        quantity: reqItem.quantity,
        price: getEffectivePrice(variant),
      });
    });

    const subtotal = orderItems.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );

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
    const total = subtotal - (couponResult?.couponAmount || 0) + shippingCost;

    order = this.ordersRepo.create({
      userId: null,
      guestEmail: dto.guestEmail,
      guestName: dto.guestName,
      guestPhone: dto.guestPhone ?? null,
      status: OrderStatus.PENDING,
      items: orderItems,
      subtotal: subtotal.toFixed(2),
      total: total.toFixed(2),
      couponId: couponResult?.couponId ?? null,
      couponAmount: (couponResult?.couponAmount || 0).toFixed(2),
      shippingCost: shippingCost.toFixed(2),
      shippingAddress,
      notes,
    });

    order = await this.ordersRepo.save(order);
    await this.decrementStock(guestLines);
    if (couponResult) {
      await this.couponsService.incrementUsage(couponResult.couponId, dto.guestEmail, order.id);
    }
    this.logger.log(
      `Guest order placed: #${order.id} by ${dto.guestEmail} — ${orderItems.length} item(s), total $${order.total}`,
    );

    let accessToken: string | undefined;

    if (dto.createAccount) {
      if (!dto.password) {
        this.logger.warn(
          `Skipped account creation for guest order #${order.id} — createAccount was true but no password was provided.`,
        );
      } else {
        const existing = await this.usersService.findByEmail(dto.guestEmail);
        if (existing) {
          this.logger.log(
            `Skipped account creation for guest order #${order.id} — email ${dto.guestEmail} is already registered.`,
          );
        } else {
          const passwordHash = await bcrypt.hash(dto.password, 10);
          const newUser = await this.usersService.create({
            email: dto.guestEmail,
            passwordHash,
            fullName: dto.guestName,
            phone: dto.guestPhone,
          });

          await this.ordersRepo.update(order.id, { userId: newUser.id });
          order.userId = newUser.id;

          accessToken = this.jwtService.sign({
            sub: newUser.id,
            email: newUser.email,
            role: newUser.role,
          });

          this.logger.log(
            `Account created from guest checkout: ${newUser.email} (id=${newUser.id}) — linked to order #${order.id}`,
          );
        }
      }
    }

    const session = await this.stripeService.createCheckoutSession(order);
    order.stripePaymentIntentId = session.payment_intent as string;
    await this.ordersRepo.save(order);

    const finalOrder = accessToken ? { ...order, accessToken } : order;
    return { order: finalOrder, checkoutUrl: session.url };
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

  async updateStatus(id: number, status: OrderStatus) {
    const order = await this.ordersRepo.findOne({ where: { id }, relations: ['items', 'user'] });
    if (!order) throw new NotFoundException(`Order #${id} not found`);
    const previousStatus = order.status;
    order.status = status;
    const saved = await this.ordersRepo.save(order);
    this.logger.log(`Order #${id} status changed: ${previousStatus} -> ${status}`);

    if (status === OrderStatus.CANCELLED && previousStatus !== OrderStatus.CANCELLED) {
      try {
        await this.emailService.sendOrderCancelledEmail(saved);
      } catch (err) {
        this.logger.warn(
          `Order cancellation email threw unexpectedly for order #${id}: ${err instanceof Error ? err.message : err}`,
        );
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
   * Auto-creates a Shippo shipment for an order right after payment capture,
   * mirroring the real cocojojo.com site's flow where the Stripe webhook
   * handler calls straight into ShippoService to create a shipment and buy a
   * label the moment a payment succeeds (see shippo.service.ts createShipment
   * + purchaseLabel). Adapted to our schema: we don't have structured
   * address columns (just a free-text `shippingAddress` blob) or per-item
   * weight, so the parcel/address_to fields below are best-effort — good
   * enough to exercise the real request shape, not production-accurate.
   *
   * No-ops (never throws) when SHIPPO_API_KEY isn't configured, and never
   * fabricates a tracking number — if Shippo isn't reachable/configured, the
   * order simply has no tracking info yet, which is the truthful state.
   */
  async createShipmentForOrder(orderId: number): Promise<void> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) {
      this.logger.warn(`createShipmentForOrder: order #${orderId} not found — skipping.`);
      return;
    }

    const apiKey = process.env.SHIPPO_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        `SHIPPO_API_KEY not configured — skipping auto shipment creation for order #${orderId}.`,
      );
      return;
    }

    if (order.shippoTrackingNumber) {
      this.logger.warn(
        `Order #${orderId} already has a Shippo tracking number (${order.shippoTrackingNumber}) — skipping duplicate shipment creation.`,
      );
      return;
    }

    try {
      // TODO: replace with real warehouse address from config, same as the
      // real site's ShippoService.convertOrderToShippoFormat (address_from
      // is currently hardcoded there too, pending config wiring).
      const addressFrom = {
        name: process.env.SHIPPO_FROM_NAME || 'CocoJojo Warehouse',
        street1: process.env.SHIPPO_FROM_STREET1 || '123 Warehouse St',
        city: process.env.SHIPPO_FROM_CITY || 'Los Angeles',
        state: process.env.SHIPPO_FROM_STATE || 'CA',
        zip: process.env.SHIPPO_FROM_ZIP || '90001',
        country: process.env.SHIPPO_FROM_COUNTRY || 'US',
        phone: process.env.SHIPPO_FROM_PHONE || '555-123-4567',
        email: process.env.SHIPPO_FROM_EMAIL || 'shipping@cocojojo.com',
      };

      // Our schema only stores shipping address as a single free-text field
      // (Order.shippingAddress), not structured street/city/state/zip
      // columns like the real site — use it as street1 and leave the
      // structured fields to whatever contact info we do have.
      const addressTo = {
        name: order.guestName || `Order #${order.id} customer`,
        street1: order.shippingAddress || '',
        city: '',
        state: '',
        zip: '',
        country: 'US',
        phone: order.guestPhone || undefined,
        email: order.guestEmail || undefined,
      };

      const parcel = {
        length: 12,
        width: 9,
        height: 3,
        distance_unit: 'in',
        weight: 1,
        mass_unit: 'lb',
      };

      const shipmentResponse = await axios.post(
        'https://api.goshippo.com/shipments/',
        {
          address_from: addressFrom,
          address_to: addressTo,
          parcels: [parcel],
          async: false,
        },
        {
          headers: { Authorization: `ShippoToken ${apiKey}` },
          timeout: 10000,
        },
      );

      const rates: Array<{ object_id: string }> = shipmentResponse.data?.rates || [];
      if (!rates.length) {
        this.logger.warn(
          `Shippo returned no rates for order #${orderId} — cannot purchase a label, skipping.`,
        );
        return;
      }

      const transactionResponse = await axios.post(
        'https://api.goshippo.com/transactions/',
        {
          rate: rates[0].object_id,
          label_file_type: 'PDF_4x6',
          async: false,
        },
        {
          headers: { Authorization: `ShippoToken ${apiKey}` },
          timeout: 10000,
        },
      );

      const transaction = transactionResponse.data;
      const trackingNumber: string | undefined = transaction?.tracking_number;
      const carrier: string | undefined = transaction?.rate?.provider;

      if (!trackingNumber || !carrier) {
        this.logger.warn(
          `Shippo transaction for order #${orderId} did not return a tracking number/carrier — skipping.`,
        );
        return;
      }

      applyTrackingNumber(order, trackingNumber, carrier.toLowerCase());
      await this.ordersRepo.save(order);
      this.logger.log(
        `Order #${orderId} shipment auto-created via Shippo: carrier=${carrier} trackingNumber=${trackingNumber}`,
      );
    } catch (err) {
      this.logger.warn(
        `Shippo auto shipment creation failed for order #${orderId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Pushes an order to ShipStation right after payment capture, mirroring
   * the real cocojojo.com site's SHIPSTATION completion-job case (see
   * stripe-completion-worker.service.ts, ~line 220) which dedupes on
   * order.shipstationOrderId and calls straight into ShipStationService.
   * Complementary to createShipmentForOrder's Shippo call, not a
   * replacement — see ShipStationService's class doc for why both run.
   *
   * Loads items + user (needed to build the ShipStation request payload,
   * neither of which the bare findOne in createShipmentForOrder needs).
   * Never throws — a ShipStation-side failure must never break Stripe
   * webhook acknowledgment, matching createShipmentForOrder's convention.
   */
  async pushOrderToShipStation(orderId: number): Promise<void> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId },
      relations: ['items', 'user'],
    });
    if (!order) {
      this.logger.warn(`pushOrderToShipStation: order #${orderId} not found — skipping.`);
      return;
    }

    if (order.shipstationOrderId) {
      this.logger.warn(
        `Order #${orderId} already has a ShipStation order id (${order.shipstationOrderId}) — skipping duplicate push.`,
      );
      return;
    }

    try {
      const shipstationOrderId = await this.shipStationService.createOrder(order);
      if (!shipstationOrderId) {
        // ShipStationService already logged the specific reason
        // (not configured / API error / no orderId in response).
        return;
      }

      order.shipstationOrderId = shipstationOrderId;
      await this.ordersRepo.save(order);
      this.logger.log(`Order #${orderId} shipstationOrderId persisted: ${shipstationOrderId}`);
    } catch (err) {
      this.logger.warn(
        `ShipStation push threw unexpectedly for order #${orderId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

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

  async getTrackingCheckpoints(orderId: number): Promise<TrackingResult> {
    const order = await this.ordersRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);

    if (!order.trackingNumber || !order.carrierCode) {
      return { available: false, reason: 'not_shipped_yet' };
    }

    const apiKey = process.env.SHIPPO_API_KEY;
    if (!apiKey) {
      return { available: false, reason: 'tracking_not_configured' };
    }

    try {
      const carrier =
        order.carrierCode === CarrierCode.OTHER ? order.carrierCode : order.carrierCode;
      const url = `https://api.goshippo.com/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(order.trackingNumber)}`;
      const response = await axios.get<ShippoTrackingResponse>(url, {
        headers: { Authorization: `ShippoToken ${apiKey}` },
        timeout: 10000,
      });

      const data = response.data;
      const mapped = mapShippoTrackingResponseToCheckpoints(data);
      if (!mapped) {
        this.logger.warn(
          `Shippo tracking response for order #${orderId} (${order.carrierCode}/${order.trackingNumber}) is missing tracking_status — treating as lookup failure.`,
        );
        return { available: false, reason: 'lookup_failed' };
      }
      const { currentStatus, checkpoints } = mapped;

      await this.maybeAdvanceStatus(order, currentStatus);

      return {
        available: true,
        carrier: data.carrier,
        trackingNumber: data.tracking_number,
        currentStatus,
        eta: data.eta ?? null,
        checkpoints,
      };
    } catch (err) {
      this.logger.warn(
        `Shippo tracking lookup failed for order #${orderId} (${order.carrierCode}/${order.trackingNumber}): ${err instanceof Error ? err.message : err}`,
      );
      return { available: false, reason: 'lookup_failed' };
    }
  }
}
