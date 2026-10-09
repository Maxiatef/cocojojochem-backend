/**
 * Replace every product with the 9 COCOJOJO products from the IT handoff
 * (COCOJOJO-Website/app/products-data.json, copied to ./products.json).
 *
 *   npm run db:reference-products            dry run: backup + plan, then roll back
 *   npm run db:reference-products -- --apply  do it
 *
 * Uses the DB_* settings from .env. Writes a full JSON backup of the current
 * catalog (and the cart, wishlist and order links the delete affects) to
 * ./db-backups/ first — that folder holds customer data and is git-ignored.
 *
 * Without --apply it only backs up and prints the plan (dry run), then rolls back.
 * Order: backup the current catalog to JSON -> BEGIN -> delete all products
 * (FKs cascade / set null) -> insert the 9 with variants + functions -> verify -> COMMIT.
 */
const path = require('path');
const fs = require('fs');
const APPLY = process.argv.includes('--apply');
const root = path.join(__dirname, '..', '..');
const dataPath = path.join(__dirname, 'products.json');
const backupDir = path.join(root, 'db-backups');
require('dotenv').config({ path: path.join(root, '.env') });
const { Client } = require('pg');

const CATEGORY = {
  'Natural oils': 'natural-oils',
  'Active ingredients': 'active-ingredients',
  'Texture builders': 'thickeners',
  'Botanical waters': 'hydrosols',
  'Butters & waxes': 'organic-butters-and-waxes',
};
const FUNCTION = {
  Emollient: 'emollient',
  'Skin conditioning': 'skin-conditioning',
  'Carrier oil': 'carrier-oil',
  'Hair conditioning': 'hair-conditioning',
  'Tone evening': 'even-tone',
  'Even-tone': 'even-tone',
  'Active ingredient': 'water-soluble-active',
  'Gel formation': 'viscosity-builder',
  'Suspension stabilization': 'stabilizing-agent',
  'Rheology modifier': 'rheology-modifier',
  Brightening: 'brightening-support-agent',
  'Scalp conditioning': 'scalp-conditioning-agent',
  'Facial refreshing': 'toning',
  'Water-phase scenting': 'aromatic-botanical',
  'Balm structuring': 'structuring',
  'Moisture sealing': 'occlusive',
  'Oil cleansing': 'cleansing-agent',
};
// SKU stem per product (unique, readable).
const SKU = {
  'jojoba-oil-clear': 'CJ-JOJ-CLR',
  'jojoba-oil-golden': 'CJ-JOJ-GLD',
  'jojoba-golden-retail': 'CJ-JOJ-GLD-RTL',
  'niacinamide-vitamin-b3': 'CJ-NIA-B3',
  'carbomer-940': 'CJ-CBM-940',
  'alpha-arbutin': 'CJ-ARB-ALP',
  'eucalyptus-hydrosol': 'CJ-HYD-EUC',
  'shea-nut-butter-natural': 'CJ-SHE-NAT',
  'sunflower-oil-high-oleic': 'CJ-SUN-HO',
};
// The only published price on the reference (retail-offers.json): $89.99.
const PRICES = { 'jojoba-golden-retail|1 Gallon': '89.99' };

function variantFor(p, label) {
  const code = label.replace(/^1\s+/, '').replace(/\s+/g, '').toUpperCase(); // PAIL, DRUM, 44LB, KG, GALLON
  let weightLb = null;
  if (/^44 LB$/i.test(label)) weightLb = '44.00';
  else if (/^1 kg$/i.test(label)) weightLb = '2.20';
  else if (/^1 Pail$/i.test(label) && p.packWeightLb) weightLb = String(p.packWeightLb.toFixed(2));
  else if (/^1 Gallon$/i.test(label)) weightLb = '7.20'; // 1 US gal of jojoba oil (~0.86 g/ml)
  return {
    sku: `${SKU[p.slug]}-${code}`,
    label,
    price: PRICES[`${p.slug}|${label}`] || '0.00', // 0 = "Price to confirm" on the storefront
    weightLb,
    isSoldByDrum: /drum/i.test(label),
  };
}

(async () => {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8')).map((p) => ({
    ...p,
    // Guard against en dashes mangled to U+FFFD by an encoding round trip.
    name: p.name.replace(/�/g, '–'),
    description: (p.description || '').replace(/�/g, '–'),
  }));
  if (data.length !== 9) throw new Error('expected 9 products, got ' + data.length);

  const c = new Client({
    host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await c.connect();

  // 1. Backup: every product row and everything hanging off it, as JSON.
  const tables = ['products', 'product_variants', 'product_specs', 'product_documents', 'product_images', 'product_seo', 'product_functions', 'product_certifications', 'cart_items', 'wishlist_items', 'quote_list_items'];
  const backup = {};
  for (const t of tables) backup[t] = (await c.query(`SELECT * FROM "${t}"`)).rows;
  backup.order_items_variant_links = (await c.query(`SELECT id, "orderId", "productVariantId" FROM order_items WHERE "productVariantId" IS NOT NULL`)).rows;
  backup.quote_request_items_product_links = (await c.query(`SELECT id, "productId" FROM quote_request_items WHERE "productId" IS NOT NULL`)).rows;
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `products-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log('backup:', file, Object.fromEntries(Object.entries(backup).map(([k, v]) => [k, v.length])));

  // Lookups
  const cats = Object.fromEntries((await c.query(`SELECT id, slug FROM categories`)).rows.map((r) => [r.slug, r.id]));
  const fns = Object.fromEntries((await c.query(`SELECT id, slug FROM functions`)).rows.map((r) => [r.slug, r.id]));
  for (const p of data) {
    if (!cats[CATEGORY[p.category]]) throw new Error(`no category for ${p.category}`);
    for (const f of p.functions) if (!fns[FUNCTION[f]]) throw new Error(`no function for ${f}`);
  }

  await c.query('BEGIN');
  try {
    const del = await c.query(`DELETE FROM products`);
    console.log('deleted products:', del.rowCount);

    for (const p of data) {
      const { rows } = await c.query(
        `INSERT INTO products (name, slug, sku, "inciName", "shortDescription", description, "categoryId", brand, "isPublished", "isFeatured", visibility)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'COCOJOJO',true,$8,'PUBLIC') RETURNING id`,
        [p.name, p.slug, SKU[p.slug], p.inci, p.description, p.description, cats[CATEGORY[p.category]], p.slug === 'jojoba-golden-retail'],
      );
      const id = rows[0].id;
      for (const label of p.packSizes) {
        const v = variantFor(p, label);
        await c.query(
          `INSERT INTO product_variants ("productId", sku, label, price, "weightLb", "isSoldByDrum", "stockStatus")
           VALUES ($1,$2,$3,$4,$5,$6,'IN_STOCK')`,
          [id, v.sku, v.label, v.price, v.weightLb, v.isSoldByDrum],
        );
      }
      for (const fid of [...new Set(p.functions.map((f) => fns[FUNCTION[f]]))])
        await c.query(`INSERT INTO product_functions ("productId", "functionId") VALUES ($1,$2)`, [id, fid]);
    }

    const check = (await c.query(`
      SELECT p.name, p.slug, cat.slug AS category,
        (SELECT string_agg(v.label || ' $' || v.price || COALESCE(' ' || v."weightLb" || 'lb',''), ', ' ORDER BY v.label) FROM product_variants v WHERE v."productId"=p.id) AS variants,
        (SELECT string_agg(f.slug, ',') FROM product_functions pf JOIN functions f ON f.id=pf."functionId" WHERE pf."productId"=p.id) AS functions
      FROM products p JOIN categories cat ON cat.id=p."categoryId" ORDER BY p.name`)).rows;
    for (const r of check) console.log(`${r.name} [${r.slug}] ${r.category} | ${r.variants} | ${r.functions}`);
    const counts = (await c.query(`SELECT (SELECT count(*) FROM products) AS products, (SELECT count(*) FROM product_variants) AS variants, (SELECT count(*) FROM order_items) AS order_items, (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM quote_request_items) AS qr_items`)).rows[0];
    console.log('after:', counts);
    if (+counts.products !== 9 || +counts.variants !== 13) throw new Error('unexpected counts, rolling back');

    if (APPLY) { await c.query('COMMIT'); console.log('COMMITTED'); }
    else { await c.query('ROLLBACK'); console.log('DRY RUN — rolled back, nothing changed'); }
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
