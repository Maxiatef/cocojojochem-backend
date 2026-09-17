import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Integer primary keys become uuids.
 *
 * Sequential ids are guessable and countable: an order id tells you roughly
 * how many orders exist, and the id next to yours belongs to somebody else.
 * Every id in the schema becomes a `uuid` instead.
 *
 * Existing rows are preserved, not renumbered away. Each row is given a uuid,
 * every column pointing at it is rewritten to the new value by joining on the
 * old one, and only then are the integer columns dropped. Order history,
 * carts, audit trail and team membership all survive with their links intact.
 *
 * Postgres 15 supplies `gen_random_uuid()` in core, so no extension is needed.
 */
export class UuidPrimaryKeys1788900000000 implements MigrationInterface {
  name = 'UuidPrimaryKeys1788900000000';

  /**
   * Tables whose own `id` becomes a uuid.
   *
   * `migrations` is TypeORM's bookkeeping table and is not ours to touch.
   * `audit_logs` keeps its `bigint` id: nothing references it, and the id is
   * the tiebreak that orders rows written inside the same millisecond.
   */
  private readonly pkTables = [
    'bulk_sale_discounts', 'cart_items', 'carts', 'categories', 'certifications',
    'companies', 'contact_messages', 'coupon_usages', 'coupons', 'functions',
    'newsletter_subscribers', 'order_items', 'orders', 'page_views',
    'password_reset_requests', 'pending_checkouts', 'product_documents',
    'product_images', 'product_seo', 'product_specs', 'product_variants',
    'products', 'quote_list_items', 'quote_request_items', 'quote_requests',
    'refresh_tokens', 'roles', 'seo_issues', 'seo_metrics', 'seo_pages',
    'shipping_rate_tiers', 'site_settings', 'teams', 'testimonials', 'users',
    'wishlist_items',
  ];

  /**
   * Every column holding a reference, as [table, column, referenced table].
   *
   * Taken from the live schema rather than from the foreign keys alone —
   * several of these were never given a constraint (`refresh_tokens.userId`,
   * `pending_checkouts.userId`, `quote_list_items.*`, `audit_logs.actorId`),
   * and a migration driven only by `information_schema` foreign keys would
   * have left them as integers pointing at nothing.
   */
  private readonly refs: [string, string, string][] = [
    ['audit_logs', 'actorId', 'users'],
    ['cart_items', 'cartId', 'carts'],
    ['cart_items', 'productVariantId', 'product_variants'],
    ['carts', 'userId', 'users'],
    ['categories', 'parentId', 'categories'],
    ['coupon_usages', 'couponId', 'coupons'],
    ['coupon_usages', 'orderId', 'orders'],
    ['order_items', 'orderId', 'orders'],
    ['order_items', 'productVariantId', 'product_variants'],
    ['orders', 'couponId', 'coupons'],
    ['orders', 'userId', 'users'],
    ['password_reset_requests', 'userId', 'users'],
    ['pending_checkouts', 'couponId', 'coupons'],
    ['pending_checkouts', 'userId', 'users'],
    ['product_certifications', 'certificationId', 'certifications'],
    ['product_certifications', 'productId', 'products'],
    ['product_documents', 'certificationId', 'certifications'],
    ['product_documents', 'productId', 'products'],
    ['product_functions', 'functionId', 'functions'],
    ['product_functions', 'productId', 'products'],
    ['product_images', 'productId', 'products'],
    ['product_seo', 'productId', 'products'],
    ['product_specs', 'productId', 'products'],
    ['product_variants', 'productId', 'products'],
    ['products', 'categoryId', 'categories'],
    ['quote_list_items', 'productId', 'products'],
    ['quote_list_items', 'userId', 'users'],
    ['quote_request_items', 'productId', 'products'],
    ['quote_request_items', 'quoteRequestId', 'quote_requests'],
    ['quote_requests', 'assignedToId', 'users'],
    ['quote_requests', 'companyId', 'companies'],
    ['quote_requests', 'userId', 'users'],
    ['refresh_tokens', 'userId', 'users'],
    ['teams', 'managerId', 'users'],
    ['users', 'companyId', 'companies'],
    ['users', 'roleId', 'roles'],
    ['users', 'teamId', 'teams'],
    ['wishlist_items', 'productId', 'products'],
    ['wishlist_items', 'userId', 'users'],
  ];

  /** Foreign keys, rebuilt afterwards with the delete rules they have today. */
  private readonly foreignKeys: [string, string, string, string, string][] = [
    // [constraint, table, column, referenced table, ON DELETE]
    ['FK_edd714311619a5ad09525045838', 'cart_items', 'cartId', 'carts', 'CASCADE'],
    ['FK_98ba4bbf6e3611d2062b898f5c1', 'cart_items', 'productVariantId', 'product_variants', 'CASCADE'],
    ['FK_69828a178f152f157dcf2f70a89', 'carts', 'userId', 'users', 'CASCADE'],
    ['FK_9a6f051e66982b5f0318981bcaa', 'categories', 'parentId', 'categories', 'NO ACTION'],
    ['FK_coupon_usages_couponId', 'coupon_usages', 'couponId', 'coupons', 'CASCADE'],
    ['FK_coupon_usages_orderId', 'coupon_usages', 'orderId', 'orders', 'SET NULL'],
    ['FK_f1d359a55923bb45b057fbdab0d', 'order_items', 'orderId', 'orders', 'CASCADE'],
    ['FK_9cf6578d9f8c7f43cc96c7af6d8', 'order_items', 'productVariantId', 'product_variants', 'SET NULL'],
    ['FK_151b79a83ba240b0cb31b2302d1', 'orders', 'userId', 'users', 'NO ACTION'],
    ['FK_61d4ebfd0ea444d72dbd7c04ec1', 'product_certifications', 'certificationId', 'certifications', 'NO ACTION'],
    ['FK_cf5e973cf15a3049049d9284e40', 'product_certifications', 'productId', 'products', 'CASCADE'],
    ['FK_product_documents_certification', 'product_documents', 'certificationId', 'certifications', 'SET NULL'],
    ['FK_31525dcd129d1735732343fe664', 'product_documents', 'productId', 'products', 'CASCADE'],
    ['FK_b8c9a1dab8df6cd7c50adf0ac9b', 'product_functions', 'functionId', 'functions', 'NO ACTION'],
    ['FK_dd0f24770b665645f3273c5440a', 'product_functions', 'productId', 'products', 'CASCADE'],
    ['FK_b367708bf720c8dd62fc6833161', 'product_images', 'productId', 'products', 'CASCADE'],
    ['FK_product_seo_productId', 'product_seo', 'productId', 'products', 'CASCADE'],
    ['FK_2831fa1ffe991b72d1e38f2f625', 'product_specs', 'productId', 'products', 'CASCADE'],
    ['FK_f515690c571a03400a9876600b5', 'product_variants', 'productId', 'products', 'CASCADE'],
    ['FK_ff56834e735fa78a15d0cf21926', 'products', 'categoryId', 'categories', 'NO ACTION'],
    ['FK_7ee2a72bad32b1298c376894fb5', 'quote_request_items', 'quoteRequestId', 'quote_requests', 'CASCADE'],
    ['FK_722a601ebdf44c945429ea62485', 'quote_requests', 'companyId', 'companies', 'NO ACTION'],
    ['FK_1ea22edc0dff28ac7d12e446f73', 'quote_requests', 'userId', 'users', 'NO ACTION'],
    ['FK_teams_manager', 'teams', 'managerId', 'users', 'SET NULL'],
    ['FK_6f9395c9037632a31107c8a9e58', 'users', 'companyId', 'companies', 'NO ACTION'],
    ['FK_users_roleId', 'users', 'roleId', 'roles', 'SET NULL'],
    ['FK_users_team', 'users', 'teamId', 'teams', 'SET NULL'],
    ['FK_wishlist_items_product', 'wishlist_items', 'productId', 'products', 'CASCADE'],
    ['FK_wishlist_items_user', 'wishlist_items', 'userId', 'users', 'CASCADE'],
  ];

  /** Primary keys, by their existing constraint names. */
  private readonly primaryKeys: Record<string, string> = {
    bulk_sale_discounts: 'PK_bulk_sale_discounts_id',
    cart_items: 'PK_6fccf5ec03c172d27a28a82928b',
    carts: 'PK_b5f695a59f5ebb50af3c8160816',
    categories: 'PK_24dbc6126a28ff948da33e97d3b',
    certifications: 'PK_fd763d412e4a1fb1b6dadd6e72b',
    companies: 'PK_d4bc3e82a314fa9e29f652c2c22',
    contact_messages: 'PK_contact_messages_id',
    coupon_usages: 'PK_coupon_usages_id',
    coupons: 'PK_coupons_id',
    functions: 'PK_203889d2ae5a98ffc137739301e',
    newsletter_subscribers: 'PK_38f9333e9961b2fdb589128d19b',
    order_items: 'PK_005269d8574e6fac0493715c308',
    orders: 'PK_710e2d4957aa5878dfe94e4ac2f',
    page_views: 'page_views_pkey',
    password_reset_requests: 'password_reset_requests_pkey',
    pending_checkouts: 'pending_checkouts_pkey',
    product_documents: 'PK_007c014bf4a96e835c9ebac2eab',
    product_images: 'PK_1974264ea7265989af8392f63a1',
    product_seo: 'PK_product_seo_id',
    product_specs: 'PK_d0cb5ab51b09cdbb6d3e6ce50f5',
    product_variants: 'PK_281e3f2c55652d6a22c0aa59fd7',
    products: 'PK_0806c755e0aca124e67c0cf6d7d',
    quote_list_items: 'quote_list_items_pkey',
    quote_request_items: 'PK_acc856887c8eb96467419db08c5',
    quote_requests: 'PK_c05f72de8be0ec6b0985a851558',
    refresh_tokens: 'PK_refresh_tokens_id',
    roles: 'roles_pkey',
    seo_issues: 'PK_seo_issues_id',
    seo_metrics: 'PK_seo_metrics_id',
    seo_pages: 'PK_2aeda7654601ab4fb8fdaa32a51',
    shipping_rate_tiers: 'shipping_rate_tiers_pkey',
    site_settings: 'PK_site_settings_id',
    teams: 'PK_teams',
    testimonials: 'PK_63b03c608bd258f115a0a4a1060',
    users: 'PK_a3ffb1c0c8416b9fc6f907b7433',
    wishlist_items: 'PK_wishlist_items',
  };

  /** Unique constraints that sit on a converted column. */
  private readonly uniques: [string, string, string][] = [
    ['UQ_69828a178f152f157dcf2f70a89', 'carts', '"userId"'],
    ['UQ_coupon_usages_orderId', 'coupon_usages', '"orderId"'],
    ['UQ_product_seo_productId', 'product_seo', '"productId"'],
  ];

  /** Plain indexes on converted columns, recreated verbatim. */
  private readonly indexes: [string, string][] = [
    ['IDX_audit_logs_actor', 'CREATE INDEX "IDX_audit_logs_actor" ON audit_logs ("actorId", "occurredAt" DESC) WHERE "actorId" IS NOT NULL'],
    ['IDX_password_reset_requests_userId', 'CREATE INDEX "IDX_password_reset_requests_userId" ON password_reset_requests ("userId")'],
    ['IDX_cf5e973cf15a3049049d9284e4', 'CREATE INDEX "IDX_cf5e973cf15a3049049d9284e4" ON product_certifications ("productId")'],
    ['IDX_61d4ebfd0ea444d72dbd7c04ec', 'CREATE INDEX "IDX_61d4ebfd0ea444d72dbd7c04ec" ON product_certifications ("certificationId")'],
    ['IDX_product_documents_certification', 'CREATE INDEX "IDX_product_documents_certification" ON product_documents ("certificationId") WHERE "certificationId" IS NOT NULL'],
    ['IDX_b8c9a1dab8df6cd7c50adf0ac9', 'CREATE INDEX "IDX_b8c9a1dab8df6cd7c50adf0ac9" ON product_functions ("functionId")'],
    ['IDX_dd0f24770b665645f3273c5440', 'CREATE INDEX "IDX_dd0f24770b665645f3273c5440" ON product_functions ("productId")'],
    ['IDX_quote_list_items_userId', 'CREATE INDEX "IDX_quote_list_items_userId" ON quote_list_items ("userId")'],
    ['IDX_refresh_tokens_userId', 'CREATE INDEX "IDX_refresh_tokens_userId" ON refresh_tokens ("userId")'],
    ['IDX_teams_managerId', 'CREATE INDEX "IDX_teams_managerId" ON teams ("managerId")'],
    ['IDX_users_roleId', 'CREATE INDEX "IDX_users_roleId" ON users ("roleId")'],
    ['IDX_users_teamId', 'CREATE INDEX "IDX_users_teamId" ON users ("teamId")'],
    ['UQ_wishlist_user_product', 'CREATE UNIQUE INDEX "UQ_wishlist_user_product" ON wishlist_items ("userId", "productId")'],
    ['IDX_wishlist_items_userId', 'CREATE INDEX "IDX_wishlist_items_userId" ON wishlist_items ("userId")'],
  ];

  /** Composite primary keys on the many-to-many join tables. */
  private readonly compositePks: [string, string, string][] = [
    ['PK_96ff55af1f287f62c209413d392', 'product_certifications', '"productId", "certificationId"'],
    ['PK_132af6df107d99ec9725cf0e41b', 'product_functions', '"productId", "functionId"'],
  ];

  /**
   * Ids also live inside text columns, where no foreign key can see them.
   * Left alone they would point at rows that no longer carry those numbers:
   * a coupon restricted to one variant would silently start applying to
   * everything, which is a discount leak rather than a crash.
   */
  private readonly jsonIdLists: [string, string, string][] = [
    ['coupons', 'excludedCategoryIds', 'categories'],
    ['coupons', 'excludedProductIds', 'products'],
    ['coupons', 'excludedVariantIds', 'product_variants'],
    ['coupons', 'includedCategoryIds', 'categories'],
    ['coupons', 'includedProductIds', 'products'],
    ['coupons', 'includedVariantIds', 'product_variants'],
    ['bulk_sale_discounts', 'categoryIds', 'categories'],
    ['bulk_sale_discounts', 'productIds', 'products'],
    ['bulk_sale_discounts', 'variantIds', 'product_variants'],
  ];

  /** `audit_logs.entityId` is a varchar holding whatever the record's key was. */
  private readonly auditEntities: [string, string][] = [
    ['BulkSaleDiscount', 'bulk_sale_discounts'], ['Cart', 'carts'],
    ['CartItem', 'cart_items'], ['Category', 'categories'],
    ['Certification', 'certifications'], ['Company', 'companies'],
    ['ContactMessage', 'contact_messages'], ['Coupon', 'coupons'],
    ['CouponUsage', 'coupon_usages'], ['Function', 'functions'],
    ['NewsletterSubscriber', 'newsletter_subscribers'], ['Order', 'orders'],
    ['OrderItem', 'order_items'], ['PendingCheckout', 'pending_checkouts'],
    ['Product', 'products'], ['ProductDocument', 'product_documents'],
    ['ProductImage', 'product_images'], ['ProductSeo', 'product_seo'],
    ['ProductSpec', 'product_specs'], ['ProductVariant', 'product_variants'],
    ['QuoteListItem', 'quote_list_items'], ['QuoteRequest', 'quote_requests'],
    ['QuoteRequestItem', 'quote_request_items'], ['Role', 'roles'],
    ['SeoIssue', 'seo_issues'], ['SeoMetric', 'seo_metrics'],
    ['SeoPage', 'seo_pages'], ['ShippingRateTier', 'shipping_rate_tiers'],
    ['SiteSetting', 'site_settings'], ['Team', 'teams'],
    ['Testimonial', 'testimonials'], ['User', 'users'],
    ['WishlistItem', 'wishlist_items'],
  ];

  public async up(q: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------- 1. free
    // Constraints and indexes are dropped first: a column cannot change type
    // while anything depends on it.
    for (const [name, table] of this.foreignKeys.map(([n, t]) => [n, t])) {
      await q.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    for (const [name, table] of this.uniques) {
      await q.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    for (const [name] of this.indexes) {
      await q.query(`DROP INDEX IF EXISTS "${name}"`);
    }

    // ------------------------------------------------------------ 2. new keys
    // Every row gets its uuid before anything points at it.
    for (const table of this.pkTables) {
      await q.query(`ALTER TABLE "${table}" ADD COLUMN "id__uuid" uuid NOT NULL DEFAULT gen_random_uuid()`);
    }

    // ------------------------------------------------------- 3. rewire refs
    // The trigger that makes audit_logs append-only has to stand down for the
    // whole rewrite: the log carries an actorId like any other table, and its
    // polymorphic entityId is remapped in step 5. It is restored the moment
    // both are done.
    await q.query(`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update_delete`);

    // Each reference is translated by joining on the integer it still holds.
    // A value pointing at a row that no longer exists (these columns were not
    // all constrained) simply lands as NULL rather than failing the migration.
    for (const [table, column, parent] of this.refs) {
      await q.query(`ALTER TABLE "${table}" ADD COLUMN "${column}__uuid" uuid`);
      await q.query(
        `UPDATE "${table}" AS c SET "${column}__uuid" = p."id__uuid"
           FROM "${parent}" AS p WHERE c."${column}" = p."id"`,
      );
    }

    // ------------------------------------------------- 4. ids inside strings
    for (const [table, column, parent] of this.jsonIdLists) {
      // Rebuilt element by element so an id with no matching row is dropped
      // rather than turning the whole list into NULL.
      await q.query(`
        UPDATE "${table}" t SET "${column}" = sub.rebuilt
          FROM (
            SELECT x.id AS row_id,
                   COALESCE(json_agg(p."id__uuid")::text, '[]') AS rebuilt
              FROM "${table}" x
              JOIN LATERAL json_array_elements_text(x."${column}"::json) AS e(val) ON TRUE
              JOIN "${parent}" p ON p."id"::text = e.val
             WHERE x."${column}" IS NOT NULL
             GROUP BY x.id
          ) sub
         WHERE t.id = sub.row_id
      `);
    }

    // The cart snapshot a Stripe redirect comes back to. Without this an
    // in-flight checkout would finalise against a variant id that is gone.
    await q.query(`
      UPDATE pending_checkouts pc SET "itemsJson" = sub.rebuilt
        FROM (
          SELECT x.id AS row_id,
                 json_agg(
                   CASE WHEN v."id__uuid" IS NULL THEN e.item
                        ELSE jsonb_set(e.item::jsonb, '{productVariantId}',
                                       to_jsonb(v."id__uuid"::text))::json
                   END ORDER BY e.ord
                 )::text AS rebuilt
            FROM pending_checkouts x
            JOIN LATERAL json_array_elements(x."itemsJson"::json)
                 WITH ORDINALITY AS e(item, ord) ON TRUE
            LEFT JOIN product_variants v
                   ON v."id"::text = (e.item ->> 'productVariantId')
           WHERE x."itemsJson" IS NOT NULL
           GROUP BY x.id
        ) sub
       WHERE pc.id = sub.row_id
    `);

    // ------------------------------------------------------- 5. the audit log
    // Rewriting the trail is what keeps "who changed this product" answerable
    // after the conversion; leaving it would point every historical entry at
    // a row id that no longer exists.
    for (const [entityName, table] of this.auditEntities) {
      await q.query(
        `UPDATE audit_logs a SET "entityId" = p."id__uuid"::text
           FROM "${table}" p
          WHERE a."entityName" = $1 AND a."entityId" ~ '^[0-9]+$'
            AND p."id"::text = a."entityId"`,
        [entityName],
      );
    }
    await q.query(`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_update_delete`);

    // ------------------------------------------------------------- 6. swap in
    for (const [table, column] of this.refs.map(([t, c]) => [t, c])) {
      await q.query(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
      await q.query(`ALTER TABLE "${table}" RENAME COLUMN "${column}__uuid" TO "${column}"`);
    }
    for (const table of this.pkTables) {
      await q.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${this.primaryKeys[table]}"`);
      await q.query(`ALTER TABLE "${table}" DROP COLUMN "id"`);
      await q.query(`ALTER TABLE "${table}" RENAME COLUMN "id__uuid" TO "id"`);
      await q.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${this.primaryKeys[table]}" PRIMARY KEY ("id")`);
    }

    // The NOT NULLs that the original integer columns carried. Restored after
    // the swap, because during it the new column is legitimately empty.
    const notNull: [string, string][] = [
      ['cart_items', 'cartId'], ['cart_items', 'productVariantId'],
      ['carts', 'userId'], ['coupon_usages', 'couponId'],
      ['order_items', 'orderId'], ['password_reset_requests', 'userId'],
      ['product_certifications', 'certificationId'], ['product_certifications', 'productId'],
      ['product_documents', 'productId'], ['product_functions', 'functionId'],
      ['product_functions', 'productId'], ['product_images', 'productId'],
      ['product_seo', 'productId'], ['product_specs', 'productId'],
      ['product_variants', 'productId'], ['products', 'categoryId'],
      ['quote_list_items', 'productId'], ['quote_list_items', 'userId'],
      ['quote_request_items', 'quoteRequestId'], ['refresh_tokens', 'userId'],
      ['wishlist_items', 'productId'], ['wishlist_items', 'userId'],
    ];
    for (const [table, column] of notNull) {
      await q.query(`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`);
    }
    for (const [name, table, columns] of this.compositePks) {
      await q.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`);
      await q.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" PRIMARY KEY (${columns})`);
    }

    // ------------------------------------------------------------ 7. rebuild
    for (const [name, table, columns] of this.uniques) {
      await q.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" UNIQUE (${columns})`);
    }
    for (const [, sql] of this.indexes) {
      await q.query(sql);
    }
    for (const [name, table, column, parent, onDelete] of this.foreignKeys) {
      await q.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}")
           REFERENCES "${parent}"("id") ON DELETE ${onDelete} ON UPDATE NO ACTION`,
      );
    }
  }

  /**
   * Not reversible.
   *
   * The integer ids are dropped by `up()`, and nothing records what they were,
   * so there is no honest way to put them back — a `down()` that invented new
   * sequential numbers would hand every row an id that no external reference,
   * bookmark, receipt or log line agrees with. Restore from a backup taken
   * before the migration instead; this throws rather than pretending.
   */
  public async down(): Promise<void> {
    throw new Error(
      'UuidPrimaryKeys is irreversible. Restore the database from a backup taken before it ran.',
    );
  }
}
