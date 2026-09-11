/**
 * Everything about WHAT gets audited and how it is labelled, in one place.
 *
 * Known blind spots, recorded here so the next person hits the warning rather
 * than the bug:
 *
 * - `repository.update(...)` and query-builder updates fire the subscriber
 *   with no loaded entity, so they produce NO audit row. Today all five call
 *   sites are safe — auth.service.ts:258 and users.service.ts:372 (RefreshToken,
 *   skipped), users.service.ts:278 (PasswordResetRequest, skipped),
 *   coupons.service.ts:400 (usageCount, customer checkout, no admin actor) and
 *   orders.service.ts:469 (variant stock, likewise). ANY new admin-facing code
 *   path that uses `.update()` will silently log nothing: use `save()`.
 * - `repository.delete(...)` fires no entity event at all. Use `remove()`
 *   anywhere the deletion should be recorded.
 * - Raw `queryRunner.query(...)` writes bypass subscribers entirely. There are
 *   none outside migrations today.
 * - Many-to-many changes (product.functions, product.certifications) arrive
 *   without a before-state, because `preload()` does not load existing
 *   relations.
 */

/**
 * Entities never worth a row: machine-generated, high-volume, or secrets.
 * AuditLog itself is listed to make recursion impossible rather than merely
 * unlikely.
 */
export const SKIP_ENTITIES = new Set<string>([
  'AuditLog',
  'PageView',
  'RefreshToken',
  'PasswordResetRequest',
  'Cart',
  'CartItem',
  'QuoteListItem',
  'PendingCheckout',
  'SeoMetric',
  'SeoIssue',
]);

/**
 * Child entities folded into their owning record, so one admin action reads as
 * one entry. The value is the parent entity name; the key of the column that
 * points at the parent is in CHILD_PARENT_KEY below.
 */
export const CHILD_OF: Record<string, string> = {
  ProductVariant: 'Product',
  ProductImage: 'Product',
  ProductDocument: 'Product',
  ProductSpec: 'Product',
  ProductSeo: 'Product',
  OrderItem: 'Order',
  QuoteRequestItem: 'QuoteRequest',
  CouponUsage: 'Coupon',
};

export const CHILD_PARENT_KEY: Record<string, string> = {
  ProductVariant: 'productId',
  ProductImage: 'productId',
  ProductDocument: 'productId',
  ProductSpec: 'productId',
  ProductSeo: 'productId',
  OrderItem: 'orderId',
  QuoteRequestItem: 'quoteRequestId',
  CouponUsage: 'couponId',
};

/** First path segment after /api -> the entity the route is *about*. */
export const ROUTE_ENTITY: Record<string, string> = {
  products: 'Product',
  categories: 'Category',
  functions: 'Function',
  certifications: 'Certification',
  testimonials: 'Testimonial',
  coupons: 'Coupon',
  'bulk-sales': 'BulkSaleDiscount',
  orders: 'Order',
  users: 'User',
  companies: 'Company',
  'contact-messages': 'ContactMessage',
  'quote-requests': 'QuoteRequest',
  'site-settings': 'SiteSetting',
  'shipping-rate-tiers': 'ShippingRateTier',
  'seo-pages': 'SeoPage',
  newsletter: 'NewsletterSubscriber',
};

/**
 * Which column to show as a record's human name. Falls through to name/title/
 * label/email for anything unlisted, then to the bare id.
 */
export const LABEL_FIELDS: Record<string, string[]> = {
  Product: ['name'],
  ProductVariant: ['label', 'sku'],
  ProductImage: ['url'],
  ProductDocument: ['label', 'url'],
  ProductSpec: ['key'],
  User: ['email'],
  Company: ['companyName', 'name'],
  Coupon: ['code'],
  Category: ['name'],
  ContactMessage: ['subject'],
  QuoteRequest: ['fullName'],
  SiteSetting: ['key'],
  OrderItem: ['productName'],
};

const LABEL_FALLBACKS = ['name', 'title', 'label', 'code', 'email', 'key'];

export function pickLabel(entityName: string, values: Record<string, unknown>): string | null {
  const candidates = [...(LABEL_FIELDS[entityName] || []), ...LABEL_FALLBACKS];
  for (const field of candidates) {
    const value = values[field];
    if (typeof value === 'string' && value.trim()) {
      return value.length > 255 ? `${value.slice(0, 252)}...` : value;
    }
  }
  return null;
}

/**
 * Columns the database maintains on its own. They change on literally every
 * save, so treating them as a diff would make "renamed the product" read as
 * two changes and turn every untouched child row into a modification. They are
 * still captured in a CREATE/DELETE snapshot, where the timestamp is real
 * information.
 */
export const IGNORED_DIFF_FIELDS = new Set([
  'updatedAt',
  'createdAt',
  'version',
  // Written by refreshSeoScore() after every product save, not by a person.
  // Logging them made a plain "saved the product with no edits" show up as a
  // ProductSeo change with a timestamp moving by a few seconds — noise that
  // buries the edits someone actually made.
  'seoScore',
  'seoCheckedAt',
]);

export const REDACTED = '«redacted»';

/**
 * Exact column names that must never reach the log.
 */
const REDACTED_EXACT = new Set([
  'password',
  'passwordHash',
  'tokenHash',
  'token',
  'refreshToken',
  'resetToken',
  'resetCode',
  'codeHash',
  'secret',
  'apiKey',
  'visibilityPassword',
]);

/**
 * Plus a catch-all, so a sensitive column added later is redacted by default
 * rather than leaking until someone remembers to update the list above.
 */
const REDACTED_PATTERN = /password|token|secret|hash|apikey|\bcode\b/i;

export function isSensitiveField(field: string): boolean {
  return REDACTED_EXACT.has(field) || REDACTED_PATTERN.test(field);
}

/**
 * How a child collection is named in a summary line. "1 variant changed" reads
 * like something a person did; "product variant ~1" does not.
 */
export const CHILD_NOUN: Record<string, string> = {
  ProductVariant: 'variant',
  ProductImage: 'image',
  ProductDocument: 'document',
  ProductSpec: 'spec',
  ProductSeo: 'SEO record',
  OrderItem: 'line item',
  QuoteRequestItem: 'line item',
  CouponUsage: 'usage record',
};

/** Hard cap on one request's buffer, so a bulk import can't exhaust memory. */
export const MAX_BUFFERED_CHANGES = 500;
