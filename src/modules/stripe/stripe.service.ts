import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

export interface CheckoutSessionLineItemInput {
  productName: string;
  variantLabel: string;
  price: string;
  quantity: number;
}

export interface CreateCheckoutSessionInput {
  pendingCheckoutId: number;
  items: CheckoutSessionLineItemInput[];
  shippingCost: number;
  taxAmount: number;
  couponAmount: number;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger('StripeService');
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }

  // Built from a not-yet-persisted PendingCheckout, not an Order — the
  // order isn't created until Stripe confirms payment via webhook (see
  // OrdersService.finalizeCheckoutFromPendingId), so nothing here can read
  // off an `Order` entity. `pendingCheckoutId` in metadata is how the
  // webhook finds its way back to what to actually create.
  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<Stripe.Checkout.Session> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = input.items.map((item) => ({
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(Number(item.price) * 100),
        product_data: {
          name: `${item.productName} — ${item.variantLabel}`,
        },
      },
      quantity: item.quantity,
    }));

    if (input.shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(input.shippingCost * 100),
          product_data: { name: 'Shipping' },
        },
        quantity: 1,
      });
    }

    // Tax is its own line item, same reasoning as shipping — Stripe only
    // ever charges what's itemized here, so leaving tax out of line_items
    // would undercharge relative to what the checkout page showed the
    // customer even though the eventual order row records it correctly.
    if (input.taxAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(input.taxAmount * 100),
          product_data: { name: 'Tax' },
        },
        quantity: 1,
      });
    }

    // Line items are always built from full undiscounted prices — a coupon
    // must be applied as a genuine Stripe discount, never by silently
    // shrinking a line item's price, or the receipt would misrepresent what
    // was actually bought.
    const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
    if (input.couponAmount > 0) {
      const stripeCoupon = await this.stripe.coupons.create({
        amount_off: Math.round(input.couponAmount * 100),
        currency: 'usd',
        duration: 'once',
      });
      discounts.push({ coupon: stripeCoupon.id });
    }

    return this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      ...(discounts.length ? { discounts } : {}),
      success_url: `${frontendUrl}/checkout/success`,
      cancel_url: `${frontendUrl}/checkout?cancelled=1`,
      metadata: { pendingCheckoutId: String(input.pendingCheckoutId) },
    });
  }

  constructEvent(rawBody: Buffer, signature: string, webhookSecret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}
