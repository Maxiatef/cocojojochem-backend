// Request/response shapes for ShipStation's V2 API (POST /v2/shipments),
// verified against the real OpenAPI spec at
// https://docs.shipstation.com/_bundle/apis/@shipstation-v2/openapi.yaml
// (schemas: create_shipments_request_body, create_shipment_request, address,
// shipment_item, package, weight, create_shipments_response_body, shipment).
// Not the same as V1's /orders/createorder (key+secret Basic Auth, camelCase
// fields) that the real cocojojo.com site uses — this project's ShipStation
// key is a V2 key (single API-Key header, no secret), so V2 it is.
//
// Kept as plain TS interfaces (not class-validator DTOs) since this is an
// outbound request we build ourselves, not an inbound payload to validate.

export interface ShipStationAddressDto {
  name: string;
  phone: string;
  company_name?: string;
  address_line1: string;
  address_line2?: string;
  city_locality: string;
  state_province: string;
  postal_code: string;
  country_code: string;
  address_residential_indicator?: 'yes' | 'no' | 'unknown';
  email?: string;
}

export interface ShipStationWeightDto {
  value: number;
  unit: 'pound' | 'ounce' | 'gram' | 'kilogram';
}

export interface ShipStationItemDto {
  name: string;
  sku?: string;
  quantity: number;
  unit_price?: number;
  tax_amount?: number;
  shipping_amount?: number;
  image_url?: string;
  weight?: ShipStationWeightDto;
  external_order_item_id?: string;
}

export interface ShipStationPackageDto {
  weight: ShipStationWeightDto;
}

export interface ShipStationMonetaryValueDto {
  currency: string;
  amount: number;
}

export interface CreateShipmentRequestDto {
  external_shipment_id: string;
  create_sales_order: boolean;
  ship_to: ShipStationAddressDto;
  ship_from: ShipStationAddressDto;
  items: ShipStationItemDto[];
  packages: ShipStationPackageDto[];
  amount_paid?: ShipStationMonetaryValueDto;
  internal_notes?: string;
  requested_shipment_service?: string;
}

export interface CreateShipmentsRequestBodyDto {
  shipments: CreateShipmentRequestDto[];
}
