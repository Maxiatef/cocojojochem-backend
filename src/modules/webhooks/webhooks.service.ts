import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import axios from 'axios';
import { Order, OrderStatus } from '../../entities';
import { applyTrackingNumber } from '../orders/orders.service';
import { computeAdvancedOrderStatus } from '../orders/orders.service';
import { OrdersService } from '../orders/orders.service';
import { StripeService } from '../stripe/stripe.service';
import { EmailService } from '../email/email.service';

/**
 * Listeners for Stripe / ShipStation / Shippo webhook events.
 *
 * Stripe is fully connected: real test-mode keys, signature verification via
 * `stripe.webhooks.constructEvent` (see handleStripeEvent below), and a real
 * Checkout Session flow that pushes a paid order into `PROCESSING` and
 * triggers both Shippo shipment creation and a ShipStation order push.
 *
 * Shippo is wired with real, functional API-call logic ported from the real
 * cocojojo.com site (which uses Shippo the same way we do), but currently
 * has no live key (`SHIPPO_API_KEY` is empty in `.env`) — it gracefully
 * logs "not configured" and no-ops rather than fabricating a
 * shipment/tracking number. ShipStation has a real V2 API key configured
 * (`SHIPSTATION_API_KEY` — a single-key V2 credential, not the real site's
 * V1 key+secret pair) and pushes real shipment-creation requests to
 * ShipStation's V2 API on every successful Stripe payment.
 *
 * TODO before going fully live:
 *  - ShipStation: verify requests are actually from ShipStation (IP allowlist
 *    or shared secret — ShipStation webhooks aren't signed).
 *  - Shippo: verify the webhook signature per Shippo's docs.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger('Webhooks');

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    private readonly ordersService: OrdersService,
    private readonly stripeService: StripeService,
    private readonly emailService: EmailService,
  ) {}

  async handleStripeEvent(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;
    try {
      event = this.stripeService.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET as string,
      );
    } catch (err) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${err instanceof Error ? err.message : err}`,
      );
      throw new BadRequestException('Invalid Stripe signature');
    }

    this.logger.log(`Stripe webhook received: ${event.type}`);

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = parseInt(session.metadata?.orderId || '', 10);
      if (!orderId) {
        this.logger.warn('Stripe checkout session missing metadata.orderId — ignoring.');
        return { received: true };
      }
      const order = await this.ordersRepo.findOne({ where: { id: orderId }, relations: ['items', 'user'] });
      if (!order) {
        this.logger.warn(`No order found for id ${orderId} (Stripe checkout session) — ignoring.`);
        return { received: true };
      }
      if (session.payment_status === 'unpaid') {
        return { received: true };
      }

      const wasAlreadyProcessed = order.status !== OrderStatus.PENDING;
      order.status = OrderStatus.PROCESSING;
      // Backfill for reconciliation — the session's PaymentIntent only exists
      // once the customer actually reaches Stripe's payment page, so this
      // column is still null at checkout-session-creation time.
      if (typeof session.payment_intent === 'string') {
        order.stripePaymentIntentId = session.payment_intent;
      }
      await this.ordersRepo.save(order);
      this.logger.log(`Order #${order.id} moved to PROCESSING after Stripe checkout session completion.`);

      // Mirrors the real site's flow: Stripe payment success triggers Shippo
      // shipment creation right in the webhook handler. Best-effort — a
      // shipping-side failure must never break Stripe webhook acknowledgment,
      // and createShipmentForOrder already no-ops/catches internally, but we
      // guard here too in case of an unexpected error (e.g. DB issue).
      try {
        await this.ordersService.createShipmentForOrder(order.id);
      } catch (err) {
        this.logger.warn(
          `Auto shipment creation threw unexpectedly for order #${order.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
      try {
        await this.ordersService.pushOrderToShipStation(order.id);
      } catch (err) {
        this.logger.warn(
          `ShipStation push threw unexpectedly for order #${order.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
      if (!wasAlreadyProcessed) {
        try {
          await this.emailService.sendOrderConfirmationEmail(order);
        } catch (err) {
          this.logger.warn(
            `Order confirmation email threw unexpectedly for order #${order.id}: ${err instanceof Error ? err.message : err}`,
          );
        }
        try {
          await this.emailService.sendNewOrderInternalNotification(order);
        } catch (err) {
          this.logger.warn(
            `New-order internal notification threw unexpectedly for order #${order.id}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      return { received: true };
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = parseInt(session.metadata?.orderId || '', 10);
      if (!orderId) {
        this.logger.warn('Stripe checkout session (failed) missing metadata.orderId — ignoring.');
        return { received: true };
      }
      const order = await this.ordersRepo.findOne({ where: { id: orderId } });
      if (!order) {
        this.logger.warn(`No order found for id ${orderId} (Stripe checkout session failed) — ignoring.`);
        return { received: true };
      }
      this.logger.warn(`Async payment failed for order #${order.id} (Stripe checkout session ${session.id}).`);
      return { received: true };
    }

    if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      const paymentIntentId = (event.data.object as Stripe.PaymentIntent).id;
      const order = await this.ordersRepo.findOne({
        where: { stripePaymentIntentId: paymentIntentId },
        relations: ['items', 'user'],
      });
      if (!order) {
        this.logger.warn(`No order found for Stripe payment intent ${paymentIntentId} — ignoring.`);
        return { received: true };
      }

      if (event.type === 'payment_intent.succeeded') {
        const wasAlreadyProcessed = order.status !== OrderStatus.PENDING;
        order.status = OrderStatus.PROCESSING;
        await this.ordersRepo.save(order);
        this.logger.log(`Order #${order.id} moved to PROCESSING after Stripe payment capture.`);

        try {
          await this.ordersService.createShipmentForOrder(order.id);
        } catch (err) {
          this.logger.warn(
            `Auto shipment creation threw unexpectedly for order #${order.id}: ${err instanceof Error ? err.message : err}`,
          );
        }
        if (!wasAlreadyProcessed) {
          try {
            await this.emailService.sendOrderConfirmationEmail(order);
          } catch (err) {
            this.logger.warn(
              `Order confirmation email threw unexpectedly for order #${order.id}: ${err instanceof Error ? err.message : err}`,
            );
          }
          try {
            await this.emailService.sendNewOrderInternalNotification(order);
          } catch (err) {
            this.logger.warn(
              `New-order internal notification threw unexpectedly for order #${order.id}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
      } else {
        this.logger.warn(`Payment failed for order #${order.id} (Stripe payment intent ${paymentIntentId}).`);
      }
    }

    return { received: true };
  }

  // ShipStation's real V1 webhook payload (shipstation-webhook.dto.ts on the
  // real site, which uses V1) is a thin envelope: { resource_url,
  // resource_type }, with resource_url pointing at V1's
  // `ssapi.shipstation.com/shipments?orderId=...`. Since our push side now
  // uses ShipStation V2 (see ShipStationService — V2 key, no secret), a real
  // V2 webhook subscription's payload shape/URLs likely differ and haven't
  // been verified against V2's actual webhook docs — this handler is kept
  // as best-effort or best-guess parsing of whatever resource_url is sent,
  // not confirmed to match V2's real webhook format. Flagged here rather
  // than silently assumed correct; revisit if/when V2 webhook subscriptions
  // are actually configured and a real payload can be inspected.
  async handleShipStationEvent(payload: any) {
    const resourceType = payload?.resource_type;
    this.logger.log(`ShipStation webhook received: ${resourceType || 'unknown resource_type'}`);

    if (resourceType !== 'SHIP_NOTIFY' && resourceType !== 'ITEM_SHIP_NOTIFY') {
      return { received: true };
    }

    const resourceUrl: string | undefined = payload?.resource_url;
    if (!resourceUrl) {
      this.logger.warn('ShipStation webhook missing resource_url — ignoring.');
      return { received: true };
    }

    let shipstationOrderId: string | undefined;
    try {
      shipstationOrderId = new URL(resourceUrl).searchParams.get('orderId') || undefined;
    } catch {
      this.logger.warn(`ShipStation webhook resource_url is not a valid URL: ${resourceUrl} — ignoring.`);
      return { received: true };
    }
    if (!shipstationOrderId) {
      this.logger.warn(`Could not extract orderId from ShipStation resource_url ${resourceUrl} — ignoring.`);
      return { received: true };
    }

    const order = await this.ordersRepo.findOne({
      where: { shipstationOrderId },
      relations: ['items', 'user'],
    });
    if (!order) {
      this.logger.warn(`No order found for ShipStation order id ${shipstationOrderId} — ignoring.`);
      return { received: true };
    }

    let trackingCaptured = false;

    // Try to fetch the real shipment (tracking number/carrier) from
    // resource_url — only possible when ShipStation credentials are
    // configured. Never fabricate a tracking number: if the fetch isn't
    // possible or doesn't return one, the order still moves to SHIPPED
    // (ShipStation told us it shipped) but tracking fields are left as-is.
    const apiKey = process.env.SHIPSTATION_API_KEY;
    if (apiKey) {
      try {
        const response = await axios.get(resourceUrl, {
          headers: { 'API-Key': apiKey },
          timeout: 10000,
        });
        // V1 returns camelCase (trackingNumber/carrierCode); V2 returns
        // snake_case (tracking_number) nested under packages/labels, not on
        // the shipment directly. Checking both shapes defensively since the
        // real resource_url/response shape for a V2 webhook isn't confirmed
        // (see comment above handleShipStationEvent).
        const shipment = response.data?.shipments?.[0] || response.data;
        const trackingNumber: string | undefined = shipment?.trackingNumber || shipment?.tracking_number;
        const carrierCode: string | undefined = shipment?.carrierCode || shipment?.carrier_id;
        if (trackingNumber && carrierCode) {
          applyTrackingNumber(order, trackingNumber, carrierCode);
          trackingCaptured = true;
          this.logger.log(
            `Order #${order.id} tracking captured from ShipStation webhook: carrier=${carrierCode} trackingNumber=${trackingNumber}`,
          );
        } else {
          this.logger.warn(
            `ShipStation resource_url response for order #${order.id} did not include a tracking number/carrier — leaving tracking fields unset.`,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to fetch shipment details from ShipStation for order #${order.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    } else {
      this.logger.warn(
        `SHIPSTATION_API_KEY not configured — cannot fetch tracking details for order #${order.id}, marking SHIPPED without tracking info.`,
      );
    }

    order.status = OrderStatus.SHIPPED;
    await this.ordersRepo.save(order);
    this.logger.log(`Order #${order.id} marked SHIPPED via ShipStation webhook.`);

    if (trackingCaptured) {
      try {
        await this.emailService.sendShippingConfirmationEmail(order);
      } catch (err) {
        this.logger.warn(
          `Shipping confirmation email threw unexpectedly for order #${order.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

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
    // tracking states onto both. Uses the same pure, forward-only mapping
    // as OrdersService.getTrackingCheckpoints so both code paths agree on
    // which Shippo statuses advance an order and never let a stale/older
    // webhook downgrade an order that has already reached a later status.
    const nextStatus = computeAdvancedOrderStatus(order.status, trackingStatus);

    if (nextStatus) {
      const previousStatus = order.status;
      order.status = nextStatus;
      await this.ordersRepo.save(order);
      this.logger.log(`Order #${order.id} marked ${nextStatus} via Shippo tracking update (${trackingStatus}), was ${previousStatus}.`);
    }

    return { received: true };
  }
}
