import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../../entities';

/**
 * Listeners for Stripe / ShipStation / Shippo webhook events.
 *
 * NONE of these providers are actually connected yet — no API keys, no
 * webhook signing secrets, no accounts. This mirrors the real cocojojo.com's
 * webhook shape (same event-to-status mapping logic) so the endpoints are
 * ready to receive real events the moment those integrations are set up,
 * but every handler here is best-effort: it looks for an order by whatever
 * reference id the provider sends and no-ops if it can't find one.
 *
 * TODO before going live with any of these:
 *  - Stripe: verify the webhook signature with `stripe.webhooks.constructEvent`
 *    using STRIPE_WEBHOOK_SECRET before trusting the payload at all.
 *  - ShipStation: verify requests are actually from ShipStation (IP allowlist
 *    or shared secret — ShipStation webhooks aren't signed).
 *  - Shippo: verify the webhook signature per Shippo's docs.
 *  - Store the real provider reference id (stripePaymentIntentId /
 *    shipstationOrderId) on the Order at checkout/shipping-creation time —
 *    right now these columns exist but nothing populates them yet.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('Webhooks');

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
  ) {}

  async handleStripeEvent(event: any) {
    this.logger.log(`Stripe webhook received: ${event?.type || 'unknown type'}`);

    const paymentIntentId = event?.data?.object?.id;
    if (!paymentIntentId) {
      this.logger.warn('Stripe webhook missing payment intent id — ignoring.');
      return { received: true };
    }

    const order = await this.ordersRepo.findOne({ where: { stripePaymentIntentId: paymentIntentId } });
    if (!order) {
      this.logger.warn(`No order found for Stripe payment intent ${paymentIntentId} — ignoring.`);
      return { received: true };
    }

    if (event.type === 'payment_intent.succeeded') {
      order.status = OrderStatus.PROCESSING;
      await this.ordersRepo.save(order);
      this.logger.log(`Order #${order.id} moved to PROCESSING after Stripe payment capture.`);
    } else if (event.type === 'payment_intent.payment_failed') {
      this.logger.warn(`Payment failed for order #${order.id} (Stripe payment intent ${paymentIntentId}).`);
    }

    return { received: true };
  }

  async handleShipStationEvent(payload: any) {
    const resourceType = payload?.resource_type;
    this.logger.log(`ShipStation webhook received: ${resourceType || 'unknown resource_type'}`);

    if (resourceType !== 'SHIP_NOTIFY' && resourceType !== 'ITEM_SHIP_NOTIFY') {
      return { received: true };
    }

    const shipstationOrderId = payload?.resource_url ? String(payload.resource_url) : undefined;
    if (!shipstationOrderId) {
      this.logger.warn('ShipStation webhook missing a resolvable order reference — ignoring.');
      return { received: true };
    }

    const order = await this.ordersRepo.findOne({ where: { shipstationOrderId } });
    if (!order) {
      this.logger.warn(`No order found for ShipStation reference ${shipstationOrderId} — ignoring.`);
      return { received: true };
    }

    order.status = OrderStatus.SHIPPED;
    await this.ordersRepo.save(order);
    this.logger.log(`Order #${order.id} marked SHIPPED via ShipStation webhook.`);
    return { received: true };
  }

  async handleShippoEvent(payload: any) {
    const trackingStatus = payload?.data?.tracking_status?.status;
    const trackingNumber = payload?.data?.tracking_number;
    this.logger.log(`Shippo webhook received: ${trackingStatus || 'unknown status'} for ${trackingNumber || 'unknown tracking number'}`);

    if (!trackingNumber) {
      this.logger.warn('Shippo webhook missing a tracking number — ignoring.');
      return { received: true };
    }

    const order = await this.ordersRepo.findOne({ where: { shippoTrackingNumber: trackingNumber } });
    if (!order) {
      this.logger.warn(`No order found for Shippo tracking number ${trackingNumber} — ignoring.`);
      return { received: true };
    }

    // Unlike the real site (whose enum collapses everything post-shipment
    // into SHIPPED), ours has a distinct DELIVERED status — map Shippo's
    // tracking states onto both.
    let nextStatus: OrderStatus | null = null;
    if (trackingStatus === 'DELIVERED') nextStatus = OrderStatus.DELIVERED;
    else if (['TRANSIT', 'OUT_FOR_DELIVERY', 'PICKUP'].includes(trackingStatus)) nextStatus = OrderStatus.SHIPPED;
    // PRE_TRANSIT (label created, not yet moving), RETURNED, FAILURE, UNKNOWN: leave status as-is.

    if (nextStatus && order.status !== nextStatus) {
      order.status = nextStatus;
      await this.ordersRepo.save(order);
      this.logger.log(`Order #${order.id} marked ${nextStatus} via Shippo tracking update (${trackingStatus}).`);
    }

    return { received: true };
  }
}
