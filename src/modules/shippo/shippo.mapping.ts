import { OrderStatus } from '../../entities';
import {
  ShippoLocation,
  ShippoRate,
  ShippoTrackingResponse,
  TrackingCheckpoint,
} from './shippo.types';

// Pure, side-effect-free helpers. No network, no DB — directly unit-testable.

// Order in which statuses become "reached", so a stale or out-of-order
// tracking update can never move an order backwards.
export const ORDER_STATUS_RANK: Record<string, number> = {
  [OrderStatus.PENDING]: 0,
  [OrderStatus.PROCESSING]: 1,
  [OrderStatus.SHIPPED]: 2,
  [OrderStatus.DELIVERED]: 3,
  [OrderStatus.CANCELLED]: -1,
};

/**
 * Shippo's `tracking_status.status` has exactly SIX documented values:
 * UNKNOWN, PRE_TRANSIT, TRANSIT, DELIVERED, RETURNED, FAILURE.
 *
 * The previous version of this map also cased on 'OUT_FOR_DELIVERY' and
 * 'PICKUP'. Neither is a top-level status — `out_for_delivery` is a
 * *substatus* code underneath TRANSIT — so both branches were unreachable.
 * They're gone; a package out for delivery arrives here as TRANSIT and
 * correctly maps to SHIPPED anyway.
 *
 * RETURNED and FAILURE deliberately return null rather than advancing:
 * they're exceptions that need a human, not a forward step in the happy path.
 */
export function mapShippoStatusToTargetOrderStatus(
  shippoStatus: string | undefined | null,
): OrderStatus | null {
  switch (shippoStatus) {
    case 'DELIVERED':
      return OrderStatus.DELIVERED;
    case 'TRANSIT':
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
 * What an order's status should become given its current status and a raw
 * Shippo tracking status. Returns null when nothing should change: unmapped
 * status, cancelled order, or a move that wouldn't be forward.
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
  return targetRank > currentRank ? target : null;
}

export function formatShippoLocation(location?: ShippoLocation): string | null {
  if (!location) return null;
  const parts = [location.city, location.state, location.country].filter((p) => !!p);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Normalizes `GET /tracks/{carrier}/{number}` into our checkpoint shape.
 * Prefers the carrier's substatus text for the description when present,
 * since it's more specific than `status_details` (e.g. "Out for delivery"
 * rather than a generic transit line).
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
      description: entry.status_details || entry.substatus?.text || '',
      location: formatShippoLocation(entry.location),
      timestamp: entry.status_date || '',
    }))
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  return { currentStatus, checkpoints };
}

/**
 * Orders rates cheapest-first, so the caller can try them in turn.
 *
 * A ranked list rather than a single pick, because Shippo returns rates for
 * carriers that are visible on the account but not necessarily *activated* —
 * buying one of those fails with "The UPS account is not yet registered".
 * Verified live: an 8.25lb DC shipment returned 11 rates whose cheapest was
 * an unactivated UPS service. Trying the next-cheapest instead means the
 * integration works as soon as any one carrier is live (USPS is enabled by
 * default on Shippo accounts).
 *
 * Rates Shippo itself tags CHEAPEST come first, then ascending by amount.
 * Unparseable amounts sort last rather than throwing.
 */
export function rankRates(rates: ShippoRate[]): ShippoRate[] {
  if (!rates || rates.length === 0) return [];

  const amountOf = (r: ShippoRate) => {
    const n = Number(r.amount);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };

  return [...rates].sort((a, b) => {
    const aCheapest = (a.attributes || []).includes('CHEAPEST') ? 0 : 1;
    const bCheapest = (b.attributes || []).includes('CHEAPEST') ? 0 : 1;
    if (aCheapest !== bCheapest) return aCheapest - bCheapest;
    return amountOf(a) - amountOf(b);
  });
}

/** Convenience wrapper: the single best rate, or null. */
export function selectRate(rates: ShippoRate[]): ShippoRate | null {
  return rankRates(rates)[0] ?? null;
}

/**
 * True when a failed transaction's messages indicate the CARRIER is the
 * problem (account not activated / not registered), rather than the shipment
 * itself (bad address, over weight). Only the former is worth retrying on a
 * different carrier — retrying a bad address just burns API calls.
 */
export function isCarrierAccountError(detail: string | undefined | null): boolean {
  if (!detail) return false;
  const d = detail.toLowerCase();
  return (
    d.includes('not yet registered') ||
    d.includes('not registered') ||
    d.includes('activate account') ||
    d.includes('carrier account') ||
    d.includes('account is not')
  );
}

// Matches the "City, ST 12345" / "City, ST 12345-6789" line that the checkout
// page composes into Order.shippingAddress.
const US_CITY_STATE_ZIP = /^(.+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/;

/**
 * Recovers structured city/state/zip out of the free-text
 * `Order.shippingAddress` blob.
 *
 * Our schema stores the shipping address as one text field, but Shippo
 * requires real city/state/zip to return any rates at all — the previous
 * code sent empty strings for all three, which is why label purchase could
 * never have worked. Checkout always formats a US address with a
 * "City, ST ZIP" line (see the addressLines composition in checkout/page.tsx),
 * so that line is what's matched here.
 *
 * Returns null when no such line exists, so the caller can refuse to buy a
 * label rather than sending Shippo a knowingly-broken address.
 */
export function parseShippingAddress(
  shippingAddress: string | null | undefined,
): { street1: string; city: string; state: string; zip: string } | null {
  if (!shippingAddress) return null;

  const lines = shippingAddress
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(US_CITY_STATE_ZIP);
    if (!match) continue;

    const [, city, state, zip] = match;
    // Street is the line immediately above the city/state/zip line. Earlier
    // lines are the recipient name and optional company, which Shippo takes
    // separately.
    const street1 = i > 0 ? lines[i - 1] : lines[0];
    return { street1, city: city.trim(), state: state.toUpperCase(), zip };
  }

  return null;
}
