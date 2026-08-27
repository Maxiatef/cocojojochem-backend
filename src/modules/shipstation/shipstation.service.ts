import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Order } from '../../entities';
import { SiteSettingsService } from '../site-settings/site-settings.service';
import {
  CreateShipmentRequestDto,
  ShipStationAddressDto,
  ShipStationItemDto,
} from './dto/create-shipstation-order.dto';
import {
  CreateShipmentsResponseBodyDto,
  ShipStationErrorResponseDto,
} from './dto/shipstation-response.dto';

/**
 * Pushes an order to ShipStation right after payment capture, mirroring the
 * hook point the real cocojojo.com site uses (Stripe payment success →
 * fulfillment-provider push, same place our Shippo createShipmentForOrder
 * call already lives — see orders.service.ts).
 *
 * Uses ShipStation's V2 API (POST /v2/shipments, single `API-Key` header),
 * NOT the real site's V1 API (/orders/createorder, key+secret Basic Auth) —
 * the key provided for this project is a V2 key (single value, `TEST_`
 * sandbox prefix, no secret to pair with it), so this had to diverge from
 * the real site's exact approach to actually work with what we have. Field
 * names/shapes verified against ShipStation's real V2 OpenAPI spec.
 *
 * Important V2 difference from V1: creating a shipment does NOT purchase a
 * label or produce a tracking number by itself — that's a separate
 * POST /v2/labels call once the shipment is ready to ship. This method only
 * covers "post the order to ShipStation" (the shipment record); a tracking
 * number still comes from Shippo (createShipmentForOrder) or a later label
 * purchase, never fabricated here.
 *
 * No-ops (never throws) when SHIPSTATION_API_KEY isn't configured, and never
 * fabricates a shipstationOrderId — if ShipStation isn't reachable/configured,
 * the order simply has no shipstationOrderId yet, which is the truthful state.
 */
@Injectable()
export class ShipStationService {
  private readonly logger = new Logger('ShipStation');

  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  private getApiUrl(): string {
    return process.env.SHIPSTATION_API_URL || 'https://api.shipstation.com/v2';
  }

  /**
   * Creates a shipment in ShipStation for the given Order (with its items
   * already loaded). Returns the ShipStation shipment id on success, or null
   * if not configured / already pushed / the API call failed — never throws.
   */
  async createOrder(order: Order): Promise<string | null> {
    const apiKey = process.env.SHIPSTATION_API_KEY;

    if (!apiKey) {
      this.logger.warn(
        `SHIPSTATION_API_KEY not configured — skipping ShipStation push for order #${order.id}.`,
      );
      return null;
    }

    if (order.shipstationOrderId) {
      this.logger.warn(
        `Order #${order.id} already has a ShipStation shipment id (${order.shipstationOrderId}) — skipping duplicate push.`,
      );
      return order.shipstationOrderId;
    }

    try {
      const shipmentRequest = await this.convertOrderToShipmentRequest(order);

      this.logger.debug(`ShipStation V2 shipment payload for order #${order.id}:`, {
        external_shipment_id: shipmentRequest.external_shipment_id,
        itemCount: shipmentRequest.items.length,
      });

      const response = await axios.post<CreateShipmentsResponseBodyDto>(
        `${this.getApiUrl()}/shipments`,
        { shipments: [shipmentRequest] },
        {
          headers: { 'API-Key': apiKey, 'Content-Type': 'application/json' },
          timeout: 30000,
        },
      );

      const result = response.data?.shipments?.[0];
      if (!result || (result.errors && result.errors.length > 0)) {
        this.logger.warn(
          `ShipStation V2 rejected order #${order.id}: ${result?.errors?.join('; ') || 'no shipment in response'}`,
        );
        return null;
      }

      if (!result.shipment_id) {
        this.logger.warn(`ShipStation response for order #${order.id} did not include a shipment_id — skipping.`);
        return null;
      }

      this.logger.log(
        `Order #${order.id} pushed to ShipStation successfully: shipstationOrderId=${result.shipment_id}`,
      );
      return result.shipment_id;
    } catch (err) {
      const errorData = axios.isAxiosError(err)
        ? (err.response?.data as ShipStationErrorResponseDto | undefined)
        : undefined;
      const message =
        errorData?.message || errorData?.errors?.[0]?.message || (err instanceof Error ? err.message : String(err));
      this.logger.warn(`ShipStation push failed for order #${order.id}: ${message}`);
      return null;
    }
  }

  /**
   * Convert our Order/OrderItem entities into ShipStation V2's shipment
   * request shape. Our schema only stores shipping address as a single
   * free-text field (Order.shippingAddress), not structured
   * street/city/state/zip columns — but our own checkout page always
   * formats US addresses with a "City, ST ZIP" line (see
   * checkout/page.tsx's addressLines composition), so parseUsCityStateZip
   * below recovers real structured fields from that line when present,
   * rather than sending ShipStation an "unknown" state_province that its
   * real API rejects for US addresses (confirmed live: "ship_to
   * state_province must be two characters when ship_to country_code equals
   * US"). Falls back to honest placeholders (never fabricated real-looking
   * data) only when the blob doesn't match that pattern — e.g. an order
   * placed before this parsing existed, or a non-US/manually-entered address.
   */
  private async convertOrderToShipmentRequest(order: Order): Promise<CreateShipmentRequestDto> {
    const customerName = order.guestName || order.user?.fullName || `Order #${order.id} customer`;
    const customerPhone = order.guestPhone || order.user?.phone || '0000000000';

    const parsed = parseUsCityStateZip(order.shippingAddress);

    const shipTo: ShipStationAddressDto = {
      name: customerName,
      phone: customerPhone,
      address_line1: order.shippingAddress || 'unknown',
      city_locality: parsed?.city || 'unknown',
      state_province: parsed?.state || 'XX',
      postal_code: parsed?.zip || '00000',
      country_code: 'US',
      address_residential_indicator: 'unknown',
      email: order.guestEmail || order.user?.email || undefined,
    };

    // Ship-from (warehouse) address — DB-backed setting (editable in Admin
    // Settings → Company & Warehouse) takes priority, then the env var, then
    // a hardcoded fallback, same convention as SHIPPO_FROM_* in
    // orders.service.ts createShipmentForOrder.
    const settings = await this.siteSettingsService.findAll();
    const s = settings.settings;
    const shipFrom: ShipStationAddressDto = {
      name: s['warehouseName'] || process.env.SHIPSTATION_FROM_NAME || 'CocoJojo Warehouse',
      phone: s['warehousePhone'] || process.env.SHIPSTATION_FROM_PHONE || '555-123-4567',
      address_line1: s['warehouseStreet'] || process.env.SHIPSTATION_FROM_STREET1 || '123 Warehouse St',
      city_locality: s['warehouseCity'] || process.env.SHIPSTATION_FROM_CITY || 'Los Angeles',
      state_province: s['warehouseState'] || process.env.SHIPSTATION_FROM_STATE || 'CA',
      postal_code: s['warehouseZip'] || process.env.SHIPSTATION_FROM_ZIP || '90001',
      country_code: s['warehouseCountry'] || process.env.SHIPSTATION_FROM_COUNTRY || 'US',
      address_residential_indicator: 'no',
    };

    const items: ShipStationItemDto[] = (order.items || []).map((item) => ({
      // Plain hyphen, not an em-dash — ShipStation's V2 API rejected a
      // request containing "—" with a raw byte-decoding error
      // ("Unable to translate bytes [97]... to Unicode"), confirmed live.
      name: `${item.productName} - ${item.variantLabel}`,
      sku: item.sku,
      quantity: item.quantity,
      unit_price: Number(item.price),
      tax_amount: 0,
      shipping_amount: 0,
      image_url: item.imageUrl || undefined,
      // No per-item weight column on OrderItem yet — 1 lb is a documented
      // technical-necessity fallback (V2 requires a package weight), not a
      // claim about the item's real weight, same convention as the shipping
      // rate estimator's fallback in shipping-rates.constants.ts.
      weight: { value: 1, unit: 'pound' },
    }));

    const totalWeightLb = items.reduce((sum, item) => sum + (item.weight?.value || 1) * item.quantity, 0);

    return {
      external_shipment_id: `cocojojochem-order-${order.id}`,
      create_sales_order: true,
      ship_to: shipTo,
      ship_from: shipFrom,
      items,
      packages: [{ weight: { value: totalWeightLb || 1, unit: 'pound' } }],
      amount_paid: { currency: 'usd', amount: Number(order.total) },
      internal_notes: `CocoJojo Order #${order.id}`,
      requested_shipment_service: 'usps_priority_mail',
    };
  }
}

// Recovers structured city/state/zip from our own checkout page's address
// format — one line reading "City, ST ZIP" (see checkout/page.tsx's
// addressLines composition: `${city}, ${stateCode} ${zip}` for US orders).
// Returns null if no line matches, rather than guessing.
function parseUsCityStateZip(shippingAddress: string | null): { city: string; state: string; zip: string } | null {
  if (!shippingAddress) return null;
  for (const line of shippingAddress.split('\n')) {
    const match = line.trim().match(/^(.+),\s*([A-Za-z]{2})\s+(\d{4,10}(?:-\d{4})?)$/);
    if (match) {
      return { city: match[1].trim(), state: match[2].toUpperCase(), zip: match[3] };
    }
  }
  return null;
}
