// Request/response shapes for the Shippo REST API, verified against the
// official reference (https://docs.goshippo.com/shippoapi/public-api/,
// API version 2018-02-08).
//
// Kept as plain interfaces rather than class-validator DTOs: these are
// outbound requests we build and inbound third-party payloads we defensively
// read, not request bodies our own controllers validate.

// --- Addresses -------------------------------------------------------------

export interface ShippoAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string; // ISO 3166-1 alpha-2, required by Shippo
  phone?: string;
  email?: string;
}

// --- Parcels ---------------------------------------------------------------

// Shippo requires all six of these together (or a `template` instead).
// distance_unit ∈ cm|in|ft|m|mm|yd, mass_unit ∈ g|kg|lb|oz.
export interface ShippoParcel {
  length: number;
  width: number;
  height: number;
  distance_unit: 'in' | 'cm';
  weight: number;
  mass_unit: 'lb' | 'kg';
}

// --- Rates -----------------------------------------------------------------

export interface ShippoServiceLevel {
  name?: string;
  token?: string;
  terms?: string;
}

export interface ShippoRate {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel?: ShippoServiceLevel;
  estimated_days?: number;
  // Shippo tags rates it considers CHEAPEST / FASTEST / BESTVALUE. There is
  // no server-side "cheapest only" filter, so selection happens client-side.
  attributes?: string[];
}

export interface ShippoShipmentResponse {
  object_id?: string;
  status?: 'WAITING' | 'QUEUED' | 'SUCCESS' | 'ERROR';
  rates?: ShippoRate[];
  messages?: unknown[];
}

// --- Transactions (label purchase) ----------------------------------------

export interface ShippoTransactionResponse {
  object_id?: string;
  // 7 documented values; only SUCCESS means a label exists.
  status?: 'WAITING' | 'QUEUED' | 'SUCCESS' | 'ERROR' | 'REFUNDED' | 'REFUNDPENDING' | 'REFUNDREJECTED';
  tracking_number?: string;
  tracking_url_provider?: string;
  label_url?: string;
  eta?: string | null;
  rate?: ShippoRate;
  messages?: Array<{ text?: string; source?: string; code?: string } | string>;
}

// --- Tracking --------------------------------------------------------------

export interface ShippoLocation {
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// Shippo's substatus, when the carrier provides one. Best-effort per carrier,
// so always branch on the parent `status` and treat this as decoration only.
export interface ShippoSubstatus {
  code?: string;
  text?: string;
  action_required?: boolean;
}

export interface ShippoTrackingHistoryEntry {
  status: string;
  status_details?: string;
  status_date?: string;
  substatus?: ShippoSubstatus;
  location?: ShippoLocation;
}

export interface ShippoTrackingResponse {
  carrier: string;
  tracking_number: string;
  tracking_status?: ShippoTrackingHistoryEntry;
  tracking_history?: ShippoTrackingHistoryEntry[];
  eta?: string | null;
}

// --- Our normalized shapes -------------------------------------------------

export interface TrackingCheckpoint {
  status: string;
  description: string;
  location: string | null;
  timestamp: string;
}

export type TrackingResult =
  | {
      available: false;
      reason: 'not_shipped_yet' | 'tracking_not_configured' | 'lookup_failed';
      // Present whenever the order HAS a stored tracking number but the live
      // lookup could not run (test-mode token, a manually-entered 'other'
      // carrier, or a Shippo outage). Without these the customer was told
      // "tracking unavailable" and never shown the number they could paste
      // into the carrier's own site — even though we had it all along.
      carrier?: string;
      trackingNumber?: string;
    }
  | {
      available: true;
      carrier: string;
      trackingNumber: string;
      currentStatus: string;
      eta: string | null;
      checkpoints: TrackingCheckpoint[];
    };

/** Outcome of an attempted label purchase, for logging and admin feedback. */
export type LabelPurchaseResult =
  | { purchased: true; trackingNumber: string; carrier: string; labelUrl: string | null }
  | {
      purchased: false;
      reason:
        | 'not_configured'
        | 'order_not_found'
        | 'already_has_tracking'
        | 'unshippable_address'
        | 'missing_weight'
        | 'requires_freight_quote'
        | 'no_rates'
        | 'purchase_failed';
      detail?: string;
    };
