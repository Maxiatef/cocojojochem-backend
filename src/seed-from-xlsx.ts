/**
 * Wholesale Product Seed (from xlsx)
 *
 * Reads seed-data-source/Wholesale-Product-Categories.xlsx and seeds real
 * chemical/cosmetic-ingredient Products + ProductVariants, attaching each to
 * an existing Category (seeded by seed-real-catalog.ts) and Functions.
 *
 * Mirrors the real cocojojo.com's prisma/seed-wholesale.ts approach: same
 * two-sheet layout (bulk "Products" priced by gallon, "Active Ingredients &
 * Peptides" priced by kg), same column names, same idempotent upsert-by-sku
 * behavior — adapted here to our TypeORM entities.
 *
 * IDEMPOTENT: safe to run multiple times, upserts by Product.sku.
 *
 * Usage:  npx ts-node -T src/seed-from-xlsx.ts
 *
 * This script and its input xlsx are one-time import artifacts (same as the
 * real site, which doesn't keep the spreadsheet in its repo either) — delete
 * both under seed-data-source/ once this has been run successfully.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import * as path from 'path';
import { AppDataSource } from './data-source';
import { Category, Function as ProductFunction, Product, ProductVariant } from './entities';
import { StockStatus } from './entities/ProductVariant';

dotenv.config();

interface SheetConfig {
  sheetName: string;
  variantLabels: string[];
  priceHeaders: string[];
}

const SHEET_CONFIGS: SheetConfig[] = [
  {
    sheetName: 'Products',
    variantLabels: ['1 Gallon', '2 Gallon', '3 Gallon', '4 Gallon'],
    priceHeaders: [
      '1 Gallon Price (USD)',
      '2 Gallon Price (USD)',
      '3 Gallon Price (USD)',
      '4 Gallon Price (USD)',
    ],
  },
  {
    sheetName: 'Active Ingredients & Peptides',
    variantLabels: ['5 kg', '10 kg', '20 kg', '25 kg'],
    priceHeaders: ['5 kg Price (USD)', '10 kg Price (USD)', '20 kg Price (USD)', '25 kg Price (USD)'],
  },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseFunctions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((f) => f.replace(/•/g, '').replace(/^-/, '').trim())
    .filter((f) => f.length > 0);
}

function roundPrice(val: any): string {
  const n = typeof val === 'number' ? val : parseFloat(val);
  return (Math.round(n * 100) / 100).toFixed(2);
}

async function seed() {
  await AppDataSource.initialize();

  const categoryRepo = AppDataSource.getRepository(Category);
  const functionRepo = AppDataSource.getRepository(ProductFunction);
  const productRepo = AppDataSource.getRepository(Product);
  const variantRepo = AppDataSource.getRepository(ProductVariant);

  const xlsxPath = path.resolve(__dirname, '..', 'seed-data-source', 'Wholesale-Product-Categories.xlsx');
  console.log(`Reading: ${xlsxPath}`);
  const workbook = XLSX.readFile(xlsxPath);

  let productsCreated = 0;
  let productsUpdated = 0;
  let variantsCreated = 0;
  let variantsUpdated = 0;
  let skippedMissingCategory = 0;

  for (const config of SHEET_CONFIGS) {
    const sheet = workbook.Sheets[config.sheetName];
    if (!sheet) {
      console.warn(`Sheet "${config.sheetName}" not found — skipping.`);
      continue;
    }
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    console.log(`\nProcessing sheet "${config.sheetName}" (${rows.length} rows)`);

    for (const row of rows) {
      const productName = String(row['Product Name'] || '').trim();
      const sku = String(row['SKU'] || '').trim();
      if (!productName || !sku) continue;

      const categoryName = String(row['Category'] || '').trim();
      const category = await categoryRepo.findOne({ where: { name: categoryName } });
      if (!category) {
        console.warn(`  Skipping "${productName}": category "${categoryName}" not found in DB.`);
        skippedMissingCategory++;
        continue;
      }

      // Resolve/attach functions — reuse existing Function rows by name,
      // create any genuinely new ones so real category/function pairings hold.
      const funcNames = parseFunctions(row['Function of Product']);
      const functions: ProductFunction[] = [];
      for (const fn of funcNames) {
        let fnRow = await functionRepo.findOne({ where: { name: fn } });
        if (!fnRow) {
          fnRow = await functionRepo.save(functionRepo.create({ name: fn, slug: slugify(fn) }));
        }
        functions.push(fnRow);
      }

      const inciName = String(row['INCI'] || '').trim() || null;
      const shortDescription = String(row['Short Description'] || '').trim() || null;
      const chemicalDescriptions = String(row['Chemical Description'] || '').trim() || null;

      let product = await productRepo.findOne({ where: { sku }, relations: ['functions'] });
      if (product) {
        product.name = productName;
        product.category = category;
        product.categoryId = category.id;
        product.inciName = inciName;
        product.shortDescription = shortDescription;
        product.chemicalDescriptions = chemicalDescriptions;
        product.functions = functions;
        await productRepo.save(product);
        productsUpdated++;
      } else {
        product = await productRepo.save(
          productRepo.create({
            name: productName,
            slug: slugify(productName),
            sku,
            inciName,
            shortDescription,
            chemicalDescriptions,
            category,
            categoryId: category.id,
            functions,
          }),
        );
        productsCreated++;
      }

      for (let i = 0; i < config.priceHeaders.length; i++) {
        const price = row[config.priceHeaders[i]];
        if (price == null || price === '') continue;

        const variantSku = `${sku}-V${i + 1}`;
        const label = config.variantLabels[i];
        const existingVariant = await variantRepo.findOne({ where: { sku: variantSku } });

        if (existingVariant) {
          existingVariant.price = roundPrice(price);
          existingVariant.label = label;
          existingVariant.productId = product.id;
          await variantRepo.save(existingVariant);
          variantsUpdated++;
        } else {
          await variantRepo.save(
            variantRepo.create({
              productId: product.id,
              sku: variantSku,
              label,
              price: roundPrice(price),
              stockStatus: StockStatus.IN_STOCK,
            }),
          );
          variantsCreated++;
        }
      }
    }
  }

  console.log(
    `\nDone. Products: +${productsCreated} created, ${productsUpdated} updated. ` +
      `Variants: +${variantsCreated} created, ${variantsUpdated} updated. ` +
      `${skippedMissingCategory} row(s) skipped (category not found).`,
  );

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
