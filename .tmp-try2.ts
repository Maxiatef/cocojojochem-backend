import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { SeoAnalyzerService } from './src/modules/seo-analyzer/seo-analyzer.service';

const SHORT = 'Cetearyl alcohol is a fatty alcohol blend used as an emulsion stabiliser and thickener in creams and lotions.';
const BODY = `Supplied as white waxy pastilles, this blend of cetyl and stearyl alcohols is one of the most widely used co-emulsifiers in skincare, valued for the body and cushion it gives to oil-in-water systems without the greasy after-feel of heavier waxes.

Added to the oil phase at 60 to 75 degrees Celsius, it melts readily and disperses without grain. Typical usage rates run from 2 to 5 percent in lotions and 4 to 8 percent in richer creams and conditioners, where it also improves freeze-thaw stability and slows separation over shelf life. Because it is non-ionic, it is compatible with anionic, cationic and non-ionic emulsifier systems alike, which makes it a safe choice when reformulating around a surfactant change.

Common applications include body lotions, facial creams, hair conditioners, balms and colour cosmetics. This grade is cGMP compliant and every lot ships with a certificate of analysis so formulators can confirm purity, melting range and hydroxyl value before production.`;

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const seo = app.get(SeoAnalyzerService);
  console.log(`\n  Short description: ${SHORT.length} chars`);
  console.log(`  Full description:  ${BODY.split(/\s+/).filter(Boolean).length} words\n`);
  const r = await seo.analyzeProduct({
    productId: 4,
    name: 'Cetearyl Alcohol',
    slug: 'cetearyl-alcohol',
    focusKeyphrase: 'cetearyl alcohol',
    seoTitle: 'Cetearyl Alcohol — Wholesale & Bulk Supplier',
    metaDescription: 'Buy cetearyl alcohol in bulk. A fatty alcohol blend that stabilises emulsions and thickens creams and lotions. COA and SDS supplied on request.',
    shortDescription: SHORT,
    chemicalDescriptions: BODY,
    inciName: 'Cetearyl Alcohol',
    casNumber: '67762-27-0',
    imageCount: 2,
    imagesWithAlt: 0,
  });
  const icon = { good: '✓', warning: '!', bad: '✕' } as const;
  console.log(`  SCORE: ${r.score}/100   (${r.summary.bad} problems, ${r.summary.warning} warnings)\n`);
  r.checks.filter(c => c.status !== 'good').forEach((c) => console.log(`   ${icon[c.status]} ${c.message}`));
  await app.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
