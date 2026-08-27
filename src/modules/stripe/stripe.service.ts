import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { Order } from '../../entities';

@Injectable()
export class StripeService {
  private readonly logger = new Logger('StripeService');
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }

  async createCheckoutSession(order: Order): Promise<Stripe.Checkout.Session> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = order.items.map((item) => ({
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(Number(item.price) * 100),
        product_data: {
          name: `${item.productName} — ${item.variantLabel}`,
        },
      },
      quantity: item.quantity,
    }));

    const shippingCost = Number(order.shippingCost || 0);
    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(shippingCost * 100),
          product_data: { name: 'Shipping' },
        },
        quantity: 1,
      });
    }

    // Line items are always built from full undiscounted prices — a coupon
    // must be applied as a genuine Stripe discount, never by silently
    // shrinking a line item's price, or the receipt would misrepresent what
    // was actually bought.
    const discounts: Stripe.Checkout.SessionCreateParams.Discount[] = [];
    const couponAmount = Number(order.couponAmount || 0);
    if (couponAmount > 0) {
      const stripeCoupon = await this.stripe.coupons.create({
        amount_off: Math.round(couponAmount * 100),
        currency: 'usd',
        duration: 'once',
      });
      discounts.push({ coupon: stripeCoupon.id });
    }

    return this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      ...(discounts.length ? { discounts } : {}),
      success_url: `${frontendUrl}/checkout/success?order=${order.id}`,
      cancel_url: `${frontendUrl}/checkout?cancelled=1`,
      metadata: { orderId: String(order.id) },
    });
  }

  constructEvent(rawBody: Buffer, signature: string, webhookSecret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }
}
