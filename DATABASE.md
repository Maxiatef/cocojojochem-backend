# Database Schema Reference

22 tables in the `cocojojochem` Postgres database, grouped by purpose. Each maps to a TypeORM entity in [src/entities](src/entities).

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

## Accounts

### `users`
Login accounts — email, hashed password, name, phone, and a role (`CUSTOMER`, `ADMIN`, or `SALES`). A user can optionally belong to a company.

### `companies`
B2B account records for wholesale buyers, with an approval workflow (`PENDING` → `APPROVED`/`REJECTED`/`SUSPENDED`). This is an addition beyond what the real cocojojo.com has — it doesn't track separate wholesale companies at all — added here because cocojojochem.com is meant to be a dedicated B2B site.

## Cart & Orders

### `carts`
One cart per logged-in user, for cross-device persistence. Guest (not-logged-in) shopping carts live only in the browser's localStorage and never touch this table — same behavior confirmed on the live cocojojo.com site.

### `cart_items`
Line items inside a cart: which variant, how many, price at the time it was added (so later price changes don't silently change what's in someone's cart), and whether it's a one-time purchase or subscription.

### `orders`
A placed order: status (`PENDING` → `PROCESSING` → `SHIPPED` → `DELIVERED`, or `CANCELLED`), subtotal/total, shipping address, notes. Linked to the user who placed it.

### `order_items`
Line items inside an order — a frozen snapshot (product name, variant label, SKU, price) taken at checkout time, so the order record stays accurate even if the product is later renamed, repriced, or deleted.

## Leads & Marketing

### `quote_requests`
Submissions from the "Request a Quote" / "Request a Sample" forms — the primary lead-generation mechanism on the real cocojojo.com wholesale page. Tracks a sales pipeline status (`NEW` → `IN_PROGRESS` → `QUOTED` → `WON`/`LOST`) and which company/user (if any) it's tied to.

### `quote_request_items`
The specific products/quantities a lead asked about within one quote request.

### `testimonials`
Customer success-story quotes shown on the marketing pages, with an author, company, and optional measurable result (e.g. "300% operational scaling").

### `newsletter_subscribers`
Email addresses collected from the "Wholesale Updates" signup form.

## SEO & Infrastructure

### `seo_pages`
Per-page meta title/description/OG image overrides, so specific URLs can have custom SEO metadata without hardcoding it into page templates.

### `migrations`
TypeORM's own internal bookkeeping table — records which migration files have already been applied, so `migrationsRun`/`migration:run` knows what's left to do. Not part of the application data model.
