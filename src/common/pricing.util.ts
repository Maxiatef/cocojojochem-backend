import { ProductVariant } from '../entities';

// Mirrors the real cocojojo.com wholesale pricing rule: a sale only applies
// while salePrice is genuinely lower than price AND "now" falls inside the
// optional saleStart/saleEnd window (either bound may be open-ended).
export function isSaleActive(variant: Pick<ProductVariant, 'price' | 'salePrice' | 'saleStart' | 'saleEnd'>): boolean {
  if (variant.salePrice == null) return false;
  if (Number(variant.salePrice) >= Number(variant.price)) return false;

  const now = new Date();
  if (variant.saleStart && now < new Date(variant.saleStart)) return false;
  if (variant.saleEnd && now > new Date(variant.saleEnd)) return false;

  return true;
}

export function getEffectivePrice(variant: Pick<ProductVariant, 'price' | 'salePrice' | 'saleStart' | 'saleEnd'>): string {
  return isSaleActive(variant) ? (variant.salePrice as string) : variant.price;
}

// Decorates a variant (or list of variants) with the computed isOnSale/effectivePrice
// fields the frontend needs, without persisting them — matches the shape the live
// cocojojo.com wholesale API returns (`isOnSale`, effective `price`).
export function withPricing<T extends ProductVariant>(variant: T) {
  return {
    ...variant,
    isOnSale: isSaleActive(variant),
    effectivePrice: getEffectivePrice(variant),
  };
}
