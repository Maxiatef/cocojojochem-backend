import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Order, ProductVariant } from '../../entities';
import { SiteSettingsService } from '../site-settings/site-settings.service';
import {
  mapShippoTrackingResponseToCheckpoints,
  parseShippingAddress,
  rankRates,
  isCarrierAccountError,
} from './shippo.mapping';
import {
  LabelPurchaseResult,
  ShippoAddress,
  ShippoParcel,
  ShippoRate,
  ShippoShipmentResponse,
  ShippoTrackingResponse,
  ShippoTransactionResponse,
  TrackingResult,
} from './shippo.types';

const SHIPPO_BASE_URL = 'https://api.goshippo.com';

// Pinned explicitly. Shippo otherwise applies whatever default version is set
// on the account's developer-keys page, and version upgrades there are
// ONE-WAY and irreversible — so an account-level change could silently alter
// response shapes under us.
const SHIPPO_API_VERSION = '2018-02-08';

const REQUEST_TIMEOUT_MS = 15000;

// How many rates to attempt before giving up. Bounded because each attempt is
// a live API round-trip inside a request the customer is waiting on.
const MAX_RATE_ATTEMPTS = 4;

// Fallback parcel dimensions, in inches. Shippo requires length/width/height
// alongside the weight, and we don't model box sizes anywhere — so these
// describe a generic shipper carton. The WEIGHT, unlike these, is computed
// from real variant data: weight is what actually drives the rate, dimensions
// only matter once dimensional weight exceeds actual weight.
const FALLBACK_PARCEL_DIMS = { length: 12, width: 9, height: 6 };

// Used when a variant has no weightLb configured. Mirrors the same documented
// fallback getShippingEstimate() already uses for the local rate table, so
// both paths agree rather than one silently refusing.
const FALLBACK_VARIANT_WEIGHT_LB = 1;

@Injectable()
export class ShippoService {
  private readonly logger = new Logger('Shippo');

  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  private get apiKey(): string | undefined {
    return process.env.SHIPPO_API_KEY;
  }

  private headers(apiKey: string) {
    return {
      // Shippo uses its own scheme here, NOT `Bearer`.
      Authorization: `ShippoToken ${apiKey}`,
      'Shippo-API-Version': SHIPPO_API_VERSION,
      'Content-Type': 'application/json',
    };
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * The warehouse this ships from.
   *
   * Site settings take priority, then env, then a placeholder. The previous
   * Shippo code read neither settings nor documented env vars — it went
   * straight to the placeholder, which meant a real label would have printed
   * a fake origin address. The `missing` list below lets the caller refuse to
   * buy a label when this is still unset, and say exactly which field is
   * missing.
   */
  private async getShipFromAddress(): Promise<{
    address: ShippoAddress;
    isPlaceholder: boolean;
    missing: string[];
  }> {
    const { settings } = await this.siteSettingsService.findAll();

    const name = settings['warehouseName'] || process.env.SHIPPO_FROM_NAME || '';
    const street1 = settings['warehouseStreet'] || process.env.SHIPPO_FROM_STREET1 || '';
    const city = settings['warehouseCity'] || process.env.SHIPPO_FROM_CITY || '';
    const state = settings['warehouseState'] || process.env.SHIPPO_FROM_STATE || '';
    const zip = settings['warehouseZip'] || process.env.SHIPPO_FROM_ZIP || '';
    const country = settings['warehouseCountry'] || process.env.SHIPPO_FROM_COUNTRY || 'US';
    const phone = settings['warehousePhone'] || process.env.SHIPPO_FROM_PHONE || '';
    const email = settings['senderEmail'] || process.env.SHIPPO_FROM_EMAIL || '';

    const address: ShippoAddress = { name, street1, city, state, zip, country, phone, email };

    // Email and phone are checked here, not in isCompleteAddress(), because
    // they are required on the ORIGIN specifically: Shippo rejects the
    // transaction with `Attribute "address_from.email" must not be empty`
    // (verified live), and carriers require an origin phone for pickup
    // exceptions. Catching it here means the admin gets a message naming the
    // missing field, instead of a post-rate Shippo error string.
    const missing = [
      !name && 'warehouseName',
      !street1 && 'warehouseStreet',
      !city && 'warehouseCity',
      !state && 'warehouseState',
      !zip && 'warehouseZip',
      !country && 'warehouseCountry',
      !phone && 'warehousePhone',
      !email && 'senderEmail',
    ].filter((f): f is string => !!f);

    return { address, isPlaceholder: missing.length > 0, missing };
  }

  /**
   * Builds the parcel from the order's real contents.
   *
   * Weight comes from `ProductVariant.weightLb` × quantity, summed across the
   * order. The previous implementation hardcoded 1 lb for every shipment
   * regardless of what was bought, which would have mis-rated every label.
   *
   * Returns `requiresFreight: true` when any line is a drum: those move as
   * palletized LTL freight, and Shippo is a parcel-only platform with no
   * freight/LTL API — so a parcel label must not be bought for them.
   */
  private async buildParcel(
    order: Order,
    variantsById: Map<number, ProductVariant>,
  ): Promise<{ parcel: ShippoParcel | null; requiresFreight: boolean; weightSource: string }> {
    let totalWeight = 0;
    let usedFallback = false;
    let requiresFreight = false;

    for (const item of order.items || []) {
      const variant = item.productVariantId ? variantsById.get(item.productVariantId) : undefined;

      if (variant?.isSoldByDrum) {
        requiresFreight = true;
        continue;
      }

      const weight = variant?.weightLb != null ? Number(variant.weightLb) : FALLBACK_VARIANT_WEIGHT_LB;
      if (variant?.weightLb == null) usedFallback = true;
      totalWeight += weight * item.quantity;
    }

    if (requiresFreight) {
      return { parcel: null, requiresFreight: true, weightSource: 'drum/freight' };
    }

    if (totalWeight <= 0) {
      return { parcel: null, requiresFreight: false, weightSource: 'none' };
    }

    return {
      parcel: {
        ...FALLBACK_PARCEL_DIMS,
        distance_unit: 'in',
        weight: Number(totalWeight.toFixed(2)),
        mass_unit: 'lb',
      },
      requiresFreight: false,
      weightSource: usedFallback ? 'variant weights (some fell back to 1lb)' : 'variant weights',
    };
  }

  /**
   * Buys a shipping label for an order and returns its tracking number.
   *
   * Three Shippo calls: POST /shipments (which returns rates), then
   * POST /transactions with the chosen rate, then POST /tracks to subscribe
   * for webhook updates.
   *
   * `async: false` is sent explicitly on both writes. Shippo defaults
   * `async` to TRUE on POST /shipments and on the rate-based POST
   * /transactions, which would return a QUEUED stub with no tracking number
   * and require polling — sending false means the label is bought inline.
   *
   * Never throws: shipping is a side effect of payment, and a carrier
   * problem must never fail the webhook that records the order.
   */
  async purchaseLabelForOrder(
    order: Order,
    variantsById: Map<number, ProductVariant>,
  ): Promise<LabelPurchaseResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      this.logger.warn(
        `SHIPPO_API_KEY not configured — skipping label purchase for order #${order.id}.`,
      );
      return { purchased: false, reason: 'not_configured' };
    }

    if (order.shippoTrackingNumber) {
      this.logger.warn(
        `Order #${order.id} already has tracking (${order.shippoTrackingNumber}) — skipping duplicate label purchase.`,
      );
      return { purchased: false, reason: 'already_has_tracking' };
    }

    // --- Addresses ---------------------------------------------------------
    const { address: addressFrom, isPlaceholder, missing } = await this.getShipFromAddress();
    if (isPlaceholder) {
      this.logger.error(
        `Order #${order.id}: warehouse ship-from address is incomplete — missing ${missing.join(', ')} ` +
          `(set these in Admin > Settings, or via the matching SHIPPO_FROM_* env vars). ` +
          `Refusing to buy a label rather than printing a placeholder origin.`,
      );
      return {
        purchased: false,
        reason: 'unshippable_address',
        detail: `ship-from incomplete: missing ${missing.join(', ')}`,
      };
    }

    const parsed = parseShippingAddress(order.shippingAddress);
    if (!parsed) {
      this.logger.warn(
        `Order #${order.id}: could not parse a "City, ST ZIP" line out of shippingAddress — ` +
          `Shippo returns no rates without structured city/state/zip, so skipping label purchase.`,
      );
      return { purchased: false, reason: 'unshippable_address', detail: 'unparseable destination' };
    }

    const addressTo: ShippoAddress = {
      name: order.user?.fullName || order.guestName || `Order #${order.id} customer`,
      street1: parsed.street1,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      country: 'US',
      phone: order.user?.phone || order.guestPhone || undefined,
      email: order.user?.email || order.guestEmail || undefined,
    };

    // --- Parcel ------------------------------------------------------------
    const { parcel, requiresFreight, weightSource } = await this.buildParcel(order, variantsById);

    if (requiresFreight) {
      this.logger.log(
        `Order #${order.id} contains drum items — palletized LTL freight, which Shippo does not support. ` +
          `Needs a manual freight quote; no parcel label bought.`,
      );
      return { purchased: false, reason: 'requires_freight_quote' };
    }

    if (!parcel) {
      this.logger.warn(`Order #${order.id}: no shippable weight could be computed — skipping label purchase.`);
      return { purchased: false, reason: 'missing_weight' };
    }

    try {
      // --- 1. Create the shipment (returns rates) --------------------------
      const shipmentRes = await axios.post<ShippoShipmentResponse>(
        `${SHIPPO_BASE_URL}/shipments/`,
        { address_from: addressFrom, address_to: addressTo, parcels: [parcel], async: false },
        { headers: this.headers(apiKey), timeout: REQUEST_TIMEOUT_MS },
      );

      const rates = shipmentRes.data?.rates || [];
      if (rates.length === 0) {
        this.logger.warn(
          `Shippo returned no rates for order #${order.id} (weight ${parcel.weight}lb to ${addressTo.state} ${addressTo.zip}) — cannot buy a label.`,
        );
        return { purchased: false, reason: 'no_rates' };
      }

      // --- 2. Buy the label ------------------------------------------------
      // Tries rates cheapest-first rather than committing to a single pick.
      // Shippo quotes carriers that are visible on the account but not
      // necessarily ACTIVATED, and buying one of those fails with "The UPS
      // account is not yet registered" — verified live on this account. Only
      // that class of failure is retried (isCarrierAccountError); a bad
      // address or an over-weight parcel fails identically on every carrier,
      // so retrying it would just burn API calls and time.
      const ranked = rankRates(rates);
      let tx: ShippoTransactionResponse | undefined;
      let rate: ShippoRate | undefined;
      let lastDetail: string | undefined;
      const skipped: string[] = [];

      for (const candidate of ranked.slice(0, MAX_RATE_ATTEMPTS)) {
        this.logger.log(
          `Order #${order.id}: trying ${candidate.provider} ${candidate.servicelevel?.name || ''} at ${candidate.amount} ${candidate.currency} ` +
            `(from ${rates.length} rates, weight ${parcel.weight}lb via ${weightSource}).`,
        );

        const txRes = await axios.post<ShippoTransactionResponse>(
          `${SHIPPO_BASE_URL}/transactions/`,
          { rate: candidate.object_id, label_file_type: 'PDF_4x6', async: false },
          { headers: this.headers(apiKey), timeout: REQUEST_TIMEOUT_MS },
        );

        const attempt = txRes.data;
        if (attempt?.status === 'SUCCESS') {
          tx = attempt;
          rate = candidate;
          break;
        }

        const messages = (attempt?.messages || [])
          .map((m) => (typeof m === 'string' ? m : m.text || m.code || ''))
          .filter(Boolean)
          .join('; ');
        lastDetail = messages || attempt?.status;

        if (isCarrierAccountError(messages)) {
          // Carrier isn't activated in the Shippo dashboard — try the next one.
          skipped.push(`${candidate.provider} (not activated)`);
          this.logger.warn(
            `Order #${order.id}: ${candidate.provider} is not activated in Shippo — trying the next cheapest rate. (${messages})`,
          );
          continue;
        }

        // Shipment-level failure: the same problem on every carrier.
        this.logger.warn(
          `Shippo transaction for order #${order.id} came back ${attempt?.status || 'with no status'}${messages ? `: ${messages}` : ''}.`,
        );
        return { purchased: false, reason: 'purchase_failed', detail: lastDetail };
      }

      if (!tx || !rate) {
        this.logger.error(
          `Order #${order.id}: no purchasable rate. Skipped: ${skipped.join(', ') || 'none'}. ` +
            `Activate at least one carrier at https://apps.goshippo.com/settings/carriers.`,
        );
        return {
          purchased: false,
          reason: 'purchase_failed',
          detail: skipped.length
            ? `no activated carrier — tried ${skipped.join(', ')}`
            : lastDetail || 'no rate could be purchased',
        };
      }

      const trackingNumber = tx.tracking_number;
      const carrier = tx.rate?.provider || rate.provider;
      if (!trackingNumber || !carrier) {
        this.logger.warn(
          `Shippo transaction for order #${order.id} succeeded but returned no tracking number/carrier — not fabricating one.`,
        );
        return { purchased: false, reason: 'purchase_failed', detail: 'missing tracking number' };
      }

      this.logger.log(
        `Order #${order.id} label purchased: carrier=${carrier} trackingNumber=${trackingNumber}` +
          (tx.label_url ? ' (label available)' : ''),
      );

      // --- 3. Subscribe for tracking webhooks ------------------------------
      // Best-effort and deliberately after the label: without this Shippo
      // never sends track_updated, which is why the webhook handler could
      // previously never fire.
      await this.registerTrackingWebhook(carrier.toLowerCase(), trackingNumber, order.id);

      return {
        purchased: true,
        trackingNumber,
        carrier: carrier.toLowerCase(),
        labelUrl: tx.label_url || null,
      };
    } catch (err) {
      this.logger.warn(
        `Shippo label purchase failed for order #${order.id}: ${this.describeError(err)}`,
      );
      return { purchased: false, reason: 'purchase_failed', detail: this.describeError(err) };
    }
  }

  /**
   * Subscribes a tracking number so Shippo pushes `track_updated` webhooks.
   *
   * Shippo requires this — a webhook registered in their dashboard only
   * delivers events for numbers that have been POSTed to /tracks. Their docs
   * also note tracking webhooks are NOT idempotent and each number should be
   * registered once, which is why this is called exactly once, right after
   * the label is bought.
   *
   * Failure here is non-fatal: the label already exists, and the on-demand
   * tracking lookup still works. It just means status won't self-advance.
   */
  /**
   * True when the configured token is a Shippo TEST token.
   *
   * Matters because test mode is not merely a sandbox with fake money — two
   * behaviours differ in ways that look like bugs otherwise:
   *   - `POST /tracks` and `GET /tracks/{carrier}/{n}` reject every real
   *     carrier ("usps is not a valid test tracking carrier. Please use
   *     'shippo'"), so tracking cannot be subscribed to at all.
   *   - Tracking status never advances, even for the 'shippo' test carrier.
   * Labels themselves DO get bought, and come back watermarked
   * "SAMPLE - DO NOT MAIL".
   */
  private get isTestMode(): boolean {
    return (this.apiKey || '').startsWith('shippo_test');
  }

  async registerTrackingWebhook(
    carrier: string,
    trackingNumber: string,
    orderId?: number,
  ): Promise<boolean> {
    const apiKey = this.apiKey;
    if (!apiKey) return false;

    if (this.isTestMode) {
      // Shippo's test API refuses real carrier names here, so there is
      // nothing to subscribe to — and test tracking never advances anyway.
      // Logged (not warned) so a test-mode run doesn't look broken.
      this.logger.log(
        `Test mode: skipping Shippo tracking subscription for ${carrier}/${trackingNumber}` +
          (orderId != null ? ` (order #${orderId})` : '') +
          `. With a live token this subscribes so track_updated webhooks arrive.`,
      );
      return false;
    }

    try {
      await axios.post(
        `${SHIPPO_BASE_URL}/tracks/`,
        {
          carrier,
          tracking_number: trackingNumber,
          // Echoed back on every webhook — lets the handler tie an event to
          // an order even if the tracking number lookup ever fails.
          metadata: orderId != null ? `order_${orderId}` : undefined,
        },
        { headers: this.headers(apiKey), timeout: REQUEST_TIMEOUT_MS },
      );
      this.logger.log(
        `Subscribed to Shippo tracking updates for ${carrier}/${trackingNumber}` +
          (orderId != null ? ` (order #${orderId})` : ''),
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `Could not subscribe to Shippo tracking for ${carrier}/${trackingNumber}: ${this.describeError(err)}. ` +
          `Status will not auto-advance for this shipment.`,
      );
      return false;
    }
  }

  /**
   * On-demand tracking lookup for the customer/admin timeline.
   * Read-only — it does not touch order status.
   */
  async getTracking(carrierCode: string, trackingNumber: string): Promise<TrackingResult> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      return { available: false, reason: 'tracking_not_configured' };
    }

    // 'other' is our own sentinel for a manually-entered carrier we don't
    // model; Shippo has no such token and would reject the request.
    if (!carrierCode || carrierCode === 'other') {
      return { available: false, reason: 'tracking_not_configured' };
    }

    if (this.isTestMode) {
      // Test tokens reject real carriers on this endpoint, so a lookup can
      // only ever fail. Returning early keeps a pointless round-trip (and a
      // scary-looking warning) out of every admin tracking view in dev.
      return { available: false, reason: 'tracking_not_configured' };
    }

    try {
      const url = `${SHIPPO_BASE_URL}/tracks/${encodeURIComponent(carrierCode)}/${encodeURIComponent(trackingNumber)}`;
      const response = await axios.get<ShippoTrackingResponse>(url, {
        headers: this.headers(apiKey),
        timeout: REQUEST_TIMEOUT_MS,
      });

      const mapped = mapShippoTrackingResponseToCheckpoints(response.data);
      if (!mapped) {
        this.logger.warn(
          `Shippo tracking response for ${carrierCode}/${trackingNumber} has no tracking_status — treating as a lookup failure.`,
        );
        return { available: false, reason: 'lookup_failed' };
      }

      return {
        available: true,
        carrier: response.data.carrier,
        trackingNumber: response.data.tracking_number,
        currentStatus: mapped.currentStatus,
        eta: response.data.eta ?? null,
        checkpoints: mapped.checkpoints,
      };
    } catch (err) {
      this.logger.warn(
        `Shippo tracking lookup failed for ${carrierCode}/${trackingNumber}: ${this.describeError(err)}`,
      );
      return { available: false, reason: 'lookup_failed' };
    }
  }

  private describeError(err: unknown): string {
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as Record<string, unknown> | undefined;
      const detail = data ? JSON.stringify(data).slice(0, 400) : err.message;
      return `${err.response?.status ?? ''} ${detail}`.trim();
    }
    return err instanceof Error ? err.message : String(err);
  }
}
