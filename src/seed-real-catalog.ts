import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from './data-source';
import { Category, Function as ProductFunction, Certification } from './entities';
import categoriesData from './seed-data/categories.json';
import functionsData from './seed-data/functions.json';

dotenv.config();

// Certification badges shown on the real cocojojo.com wholesale marketing page.
// There's no certifications API on the real site (confirmed 404) — this is our
// own addition, seeded from the badges documented on their landing page copy.
const CERTIFICATIONS = [
  { name: 'USDA Organic', iconUrl: null },
  { name: 'GMP', iconUrl: null },
  { name: 'cGMP Compliant', iconUrl: null },
  { name: 'Non-GMO', iconUrl: null },
  { name: 'Cruelty-Free', iconUrl: null },
];

async function seed() {
  await AppDataSource.initialize();

  const categoryRepo = AppDataSource.getRepository(Category);
  const functionRepo = AppDataSource.getRepository(ProductFunction);
  const certificationRepo = AppDataSource.getRepository(Certification);

  let categoriesAdded = 0;
  for (const c of categoriesData as { name: string; slug: string; description: string | null; imageUrl: string | null }[]) {
    const existing = await categoryRepo.findOne({ where: { slug: c.slug } });
    if (existing) continue;
    await categoryRepo.save(categoryRepo.create(c));
    categoriesAdded++;
  }

  let functionsAdded = 0;
  for (const f of functionsData as { name: string; slug: string }[]) {
    const existing = await functionRepo.findOne({ where: { slug: f.slug } });
    if (existing) continue;
    await functionRepo.save(functionRepo.create(f));
    functionsAdded++;
  }

  let certificationsAdded = 0;
  for (const cert of CERTIFICATIONS) {
    const existing = await certificationRepo.findOne({ where: { name: cert.name } });
    if (existing) continue;
    await certificationRepo.save(certificationRepo.create(cert));
    certificationsAdded++;
  }

  console.log(
    `Seeded ${categoriesAdded} categories, ${functionsAdded} functions, ${certificationsAdded} certifications ` +
      `(skipped any already present).`,
  );

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
