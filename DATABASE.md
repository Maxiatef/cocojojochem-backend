# Database Schema Reference

32 tables in the `cocojojochem` Postgres database, grouped by purpose. Each maps to a TypeORM entity in [src/entities](src/entities).

## Catalog (the wholesale product data)

### `categories`
Product categories (Acids, Emulsifiers, Beef Tallow, etc.). Each category tracks its own `sortOrder` for display and a live `productCount` computed at query time. Field-for-field matches the real cocojojo.com wholesale schema.

### `functions`
"Shop by Chemical Function" tags (Anti-Aging, Antioxidant, Humectant, etc.) — a second way to browse the catalog besides category, since one ingredient can serve multiple purposes.

### `products`
The core ingredient/product record: name, slug, SKU, INCI name, CAS number, botanical name, descriptions. Carries a generated `search_vector` column (weighted full-text index across name/SKU/CAS/INCI/botanical/descriptions) plus trigram indexes for fuzzy/typo-tolerant search — this is the same full-text search setup used in production on cocojojo.com. Every product belongs to exactly one category.

### `product_variants`
The actual sellable units of a product — e.g. "1 Gallon", "25 KG", "1 Drum" — each with its own SKU, price, optional sale price/window, and stock status (`IN_STOCK` / `OUT_OF_STOCK` / `ON_BACKORDER`). A product with no variants can't actually be purchased; this is where price and inventory live, not on the product itself.

### `product_functions`
Join table connecting products to functions (many-to-many) — one product can have several functions, one function applies to many products.

### `product_certifications`
Join table connecting products to certifications (many-to-many) — e.g. one product can be both USDA Organic and Non-GMO.

### `certifications`
Certification badges (USDA Organic, GMP, cGMP Compliant, Non-GMO, Cruelty-Free) that can be attached to products.

### `product_images`
Additional gallery images per product, beyond the single primary image on the variant — ordered by `sortOrder`.

### `product_documents`
Downloadable technical documents per product: COA (Certificate of Analysis), SDS (Safety Data Sheet), TDS (Technical Data Sheet), or spec sheets — standard requirements for B2B chemical buyers.

### `product_specs`
Free-form key/value technical specifications per product (e.g. "Appearance" → "White powder", "pH" → "5.5–6.5").

### `product_seo`
Per-product SEO overrides — focus keyphrase, SEO title, meta description, and separate social (Open Graph) title/description/image/tags — editable from the admin product editor's SEO tab. One row per product (`productId` unique).

## Accounts

### `users`
Login accounts — email, hashed password, name, phone, and a role (`CUSTOMER`, `ADMIN`, or `SALES`). A user can optionally belong to a company.

### `companies`
B2B account records for wholesale buyers. Carries a `status` column (`PENDING`/`APPROVED`/`REJECTED`/`SUSPENDED`) left over from an approval workflow that's no longer surfaced anywhere in the admin UI (approve/reject actions, status badges, and the related endpoints were removed) — the column still exists in the schema but nothing reads or writes it today. This table itself is an addition beyond what the real cocojojo.com has — it doesn't track separate wholesale companies at all — added here because cocojojochem.com is meant to be a dedicated B2B site.

### `refresh_tokens`
Login sessions — only the SHA-256 hash of each issued refresh token is stored (never the raw token), with an expiry and a `revokedAt` for logout/rotation. Looked up by `tokenHash` on every `/auth/refresh` call.

### `password_reset_requests`
"Forgot password" flow state — only the hash of the emailed 5-digit code is stored, plus an `attempts` counter (locks out after 5 tries) and a separate single-use `verifiedTokenHash` issued once the code is confirmed, which is what the final set-new-password step actually consumes.

## Cart & Orders

### `carts`
One cart per logged-in user, for cross-device persistence. Guest (not-logged-in) shopping carts live only in the browser's localStorage and never touch this table — same behavior confirmed on the live cocojojo.com site.

### `cart_items`
Line items inside a cart: which variant, how many, price at the time it was added (so later price changes don't silently change what's in someone's cart), and whether it's a one-time purchase or subscription.

### `orders`
A placed order: status (`PENDING` → `PROCESSING` → `SHIPPED` → `DELIVERED`, or `CANCELLED`), subtotal/total, shipping address, notes, and the actual `shippingCost` charged (computed by `/orders/shipping-estimate` and carried through checkout). Also carries the fulfillment/payment provider reference ids the webhook listeners key off of: `stripePaymentIntentId`, `shipstationOrderId`, `shippoTrackingNumber`, plus `trackingNumber`/`carrierCode` once a shipment actually ships. Linked to the user who placed it, or to `guestEmail`/`guestName`/`guestPhone` for a guest checkout.

### `order_items`
Line items inside an order — a frozen snapshot (product name, variant label, SKU, price) taken at checkout time, so the order record stays accurate even if the product is later renamed, repriced, or deleted.

## Discounts

### `coupons`
Discount codes — percentage or fixed, cart- or product-scoped, with an extensive set of WooCommerce-style restrictions (min/max order amount, per-category/product/variant/brand include/exclude lists, usage limits, date window, allowed-email patterns, free-shipping/individual-use flags). Several fields (`allowFreeShipping`, `individualUseOnly`) round-trip correctly but have no effect yet — checkout doesn't act on them today.

### `coupon_usages`
One row per time a coupon was actually applied to a placed order — links the coupon, the order (nullable, `SET NULL` if the order is deleted), and the email that used it, so per-user usage limits can be enforced.

### `bulk_sale_discounts`
Storewide or scoped "buy more, save more" percentage discounts running over a date window — standalone, no foreign keys, matching the real site's schema (category/product/variant scoping is done via JSON-stringified id arrays, same convention as `coupons`).

## Leads & Marketing

### `quote_requests`
Submissions from the "Request a Quote" / "Request a Sample" forms — the primary lead-generation mechanism on the real cocojojo.com wholesale page. Tracks a sales pipeline status (`NEW` → `IN_PROGRESS` → `QUOTED` → `WON`/`LOST`) and which company/user (if any) it's tied to. Now supports multiple products per request (see `quote_request_items`) and triggers an internal email notification on creation.

### `quote_request_items`
The specific products/quantities a lead asked about within one quote request.

### `contact_messages`
Submissions from the general "Contact Us" form — separate from quote requests. Tracks read status (`UNREAD`/`READ`/`ARCHIVED`) and a manual `repliedAt` flag an admin sets after replying outside the app (there's no way to confirm a real email was sent, so this is just an "I replied" marker, not a delivery receipt).

### `testimonials`
Customer success-story quotes shown on the marketing pages, with an author, company, and optional measurable result (e.g. "300% operational scaling").

### `newsletter_subscribers`
Email addresses collected from the "Wholesale Updates" signup form.

## SEO & Infrastructure

### `seo_pages`
Per-page meta title/description/OG image overrides, so specific URLs can have custom SEO metadata without hardcoding it into page templates.

### `seo_metrics`
One row per analyzed storefront path — title/meta description/H1 snapshot, word count, internal/external link counts, image alt-text coverage, page load time, and a computed `seoScore`. Populated by the admin SEO analyzer, not hand-edited.

### `seo_issues`
Individual flagged problems found by the SEO analyzer for a given path (missing title, missing meta description, missing/multiple H1, thin content, missing alt text), each with a severity and an `isFixed` flag an admin can toggle once addressed.

### `page_views`
One row per storefront page load, recorded by a public `POST /track/pageview` call the frontend fires on every route change (storefront only — admin pages are never tracked). Each row is just `path` + `visitorId` + `createdAt`. `visitorId` is a random UUID the browser generates once and keeps in `localStorage` — it isn't a user account or any other real identity, it exists purely so `GET /admin/analytics/visitors` can tell "3 page views" apart from "3 different people." In-house replacement for a third-party analytics SDK (no Google Analytics/Plausible/etc. — nothing like that is wired up).

### `site_settings`
Generic key/value configuration store (`PATCH /site-settings`, admin-only) — every value is a plain string keyed by an arbitrary string key. Backs the admin Settings page's General/Company & Warehouse/Wholesale & Shipping/Tax/Emails tabs (e.g. `siteName`, `WHOLESALE_MINIMUM`, `FREE_SHIPPING_THRESHOLD`, `warehouseCity`, `quoteNotificationEmail`, `senderEmail`, `tax.name`). Not every key backend logic reads is guaranteed to have a row — `SiteSettingsService.getValue()` returns `null` for an unset key, and callers fall back to an env var or hardcoded default in that case.

### `migrations`
TypeORM's own internal bookkeeping table — records which migration files have already been applied, so `migrationsRun`/`migration:run` knows what's left to do. Not part of the application data model.
