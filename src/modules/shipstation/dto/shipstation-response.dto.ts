// Response shape from ShipStation V2's POST /v2/shipments, verified against
// the real OpenAPI spec (create_shipments_response_body / create_shipment_response
// / shipment schemas). Only the fields we actually read are kept required;
// everything else is optional so we don't break if the response shape
// drifts slightly.

export interface ShipStationShipmentResponseDto {
  shipment_id: string; // e.g. "se-123456"
  external_shipment_id?: string;
  shipment_status?: string;
  errors?: string[];
  [key: string]: any;
}

export interface CreateShipmentsResponseBodyDto {
  has_errors: boolean;
  shipments: ShipStationShipmentResponseDto[];
}

// V2 errors come back as a 400 with a `errors` array on the shipment itself
// (has_errors: true), not a separate exception-style body like V1 — but we
// keep this for the axios-level failure case (network error, 500, etc.)
// where the body may not even be well-formed JSON in the shape above.
export interface ShipStationErrorResponseDto {
  message?: string;
  errors?: Array<{ message?: string }>;
  [key: string]: any;
}
