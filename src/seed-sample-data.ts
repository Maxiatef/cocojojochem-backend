/**
 * Sample/test data seed — Companies, Testimonials, guest Orders, guest Quote
 * Requests, Newsletter Subscribers, and SEO Pages. No User rows are touched.
 *
 * Run after seed-real-catalog.ts and seed-from-xlsx.ts so Orders/Quote
 * Requests can reference real seeded ProductVariants.
 *
 * IDEMPOTENT: safe to run multiple times (skip-if-exists by natural key).
 *
 * Usage:  npx ts-node -T src/seed-sample-data.ts
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { AppDataSource } from './data-source';
import {
  Company,
  AccountStatus,
  Testimonial,
  Order,
  OrderItem,
  OrderStatus,
  QuoteRequest,
  QuoteRequestItem,
  RequestType,
  RequestStatus,
  NewsletterSubscriber,
  SeoPage,
  ProductVariant,
} from './entities';

dotenv.config();

async function seed() {
  await AppDataSource.initialize();

  const companyRepo = AppDataSource.getRepository(Company);
  const testimonialRepo = AppDataSource.getRepository(Testimonial);
  const orderRepo = AppDataSource.getRepository(Order);
  const quoteRepo = AppDataSource.getRepository(QuoteRequest);
  const newsletterRepo = AppDataSource.getRepository(NewsletterSubscriber);
  const seoRepo = AppDataSource.getRepository(SeoPage);
  const variantRepo = AppDataSource.getRepository(ProductVariant);

  // ── Companies ──
  const COMPANIES = [
    { name: 'Sunrise Cosmetics Manufacturing', taxId: '87-1234567', website: 'https://sunrisecosmetics.example.com', industry: 'Cosmetics Manufacturing', status: AccountStatus.APPROVED },
    { name: 'Bluepeak Skincare Labs', taxId: '81-7654321', website: 'https://bluepeaklabs.example.com', industry: 'Skincare R&D', status: AccountStatus.PENDING },
  ];
  let companiesAdded = 0;
  for (const c of COMPANIES) {
    const existing = await companyRepo.findOne({ where: { name: c.name } });
    if (existing) continue;
    await companyRepo.save(companyRepo.create(c));
    companiesAdded++;
  }

  // ── Testimonials ──
  const TESTIMONIALS = [
    { authorName: 'Maria Chen', company: 'Sunrise Cosmetics Manufacturing', quote: 'CocoJojoChem has been a reliable bulk ingredient partner for two years running — consistent quality batch after batch.', result: 'Consistent 2-year supply relationship', sortOrder: 1 },
    { authorName: 'David Alvarez', company: 'Bluepeak Skincare Labs', quote: 'Their documentation (SDS/COA) is always ready before we ask, which speeds up our own compliance review significantly.', result: 'Faster compliance turnaround', sortOrder: 2 },
    { authorName: 'Priya Nair', company: 'Independent Formulator', quote: 'Ordering in smaller wholesale quantities let us prototype new formulas without committing to a full drum right away.', result: 'Lower prototyping cost', sortOrder: 3 },
  ];
  let testimonialsAdded = 0;
  for (const t of TESTIMONIALS) {
    const existing = await testimonialRepo.findOne({ where: { authorName: t.authorName } });
    if (existing) continue;
    await testimonialRepo.save(testimonialRepo.create({ ...t, isPublished: true }));
    testimonialsAdded++;
  }

  // ── Orders (guest orders — no User rows involved) ──
  const sampleVariants = await variantRepo.find({ relations: ['product'], take: 6 });
  let ordersAdded = 0;
  if (sampleVariants.length >= 2) {
    const SAMPLE_ORDERS = [
      {
        guestEmail: 'sample-order-1@example.com',
        guestName: 'Jordan Lee',
        guestPhone: '555-0101',
        status: OrderStatus.PENDING,
        shippingAddress: 'Jordan Lee\n120 Harbor Way\nLong Beach, CA 90802\nUnited States',
        variantIndexes: [0, 1],
      },
      {
        guestEmail: 'sample-order-2@example.com',
        guestName: 'Casey Morgan',
        guestPhone: '555-0102',
        status: OrderStatus.SHIPPED,
        shippingAddress: 'Casey Morgan\n45 Industrial Pkwy\nAustin, TX 78744\nUnited States',
        variantIndexes: [2],
      },
      {
        guestEmail: 'sample-order-3@example.com',
        guestName: 'Riley Thompson',
        guestPhone: '555-0103',
        status: OrderStatus.DELIVERED,
        shippingAddress: 'Riley Thompson\n900 Formulation Dr\nDenver, CO 80202\nUnited States',
        variantIndexes: [3, 4],
      },
    ];

    for (const o of SAMPLE_ORDERS) {
      const existing = await orderRepo.findOne({ where: { guestEmail: o.guestEmail } });
      if (existing) continue;

      const items = o.variantIndexes
        .filter((i) => sampleVariants[i])
        .map((i) => {
          const v = sampleVariants[i];
          return Object.assign(new OrderItem(), {
            productVariantId: v.id,
            productName: v.product?.name || '',
            variantLabel: v.label,
            sku: v.sku,
            quantity: 2,
            price: v.price,
          });
        });
      const subtotal = items.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0);

      await orderRepo.save(
        orderRepo.create({
          userId: null,
          guestEmail: o.guestEmail,
          guestName: o.guestName,
          guestPhone: o.guestPhone,
          status: o.status,
          shippingAddress: o.shippingAddress,
          notes: null,
          items,
          subtotal: subtotal.toFixed(2),
          total: subtotal.toFixed(2),
        }),
      );
      ordersAdded++;
    }
  } else {
    console.warn('Skipping sample Orders — fewer than 2 ProductVariants exist. Run seed-from-xlsx.ts first.');
  }

  // ── Quote Requests (guest-style — no Company/User rows required) ──
  const SAMPLE_QUOTES = [
    {
      email: 'sample-quote-1@example.com',
      fullName: 'Alex Rivera',
      phone: '555-0201',
      companyName: 'Rivera Formulation Co.',
      type: RequestType.QUOTE,
      status: RequestStatus.NEW,
      message: 'Requesting a bulk quote for 55-gallon drum pricing on surfactants.',
      itemNames: ['Cocamidopropyl Betaine', 'Sodium Lauryl Sulfate'],
    },
    {
      email: 'sample-quote-2@example.com',
      fullName: 'Taylor Kim',
      phone: '555-0202',
      companyName: null,
      type: RequestType.SAMPLE,
      status: RequestStatus.IN_PROGRESS,
      message: 'Would like small samples of your active ingredients line before a larger order.',
      itemNames: ['Niacinamide (Vitamin B3)'],
    },
    {
      email: 'sample-quote-3@example.com',
      fullName: 'Morgan Patel',
      phone: null,
      companyName: 'Patel Labs',
      type: RequestType.WHITE_LABEL,
      status: RequestStatus.QUOTED,
      message: 'Interested in white-label private label options for a hydrating serum line.',
      itemNames: ['Hyaluronic Acid (Sodium Hyaluronate) Low MW', 'Panthenol (Provitamin B5)'],
    },
  ];
  let quotesAdded = 0;
  for (const q of SAMPLE_QUOTES) {
    const existing = await quoteRepo.findOne({ where: { email: q.email } });
    if (existing) continue;

    const items = q.itemNames.map((name) =>
      Object.assign(new QuoteRequestItem(), { productName: name, quantity: 1, unit: 'unit', notes: null }),
    );

    await quoteRepo.save(
      quoteRepo.create({
        companyId: null,
        userId: null,
        fullName: q.fullName,
        email: q.email,
        phone: q.phone,
        companyName: q.companyName,
        message: q.message,
        type: q.type,
        status: q.status,
        items,
      }),
    );
    quotesAdded++;
  }

  // ── Newsletter Subscribers ──
  const NEWSLETTER_EMAILS = ['sample-subscriber-1@example.com', 'sample-subscriber-2@example.com'];
  let newsletterAdded = 0;
  for (const email of NEWSLETTER_EMAILS) {
    const existing = await newsletterRepo.findOne({ where: { email } });
    if (existing) continue;
    await newsletterRepo.save(newsletterRepo.create({ email }));
    newsletterAdded++;
  }

  // ── SEO Pages ──
  const SEO_PAGES = [
    { path: '/', metaTitle: 'CocoJojoChem — Wholesale Cosmetic Ingredients', metaDescription: 'Wholesale cosmetic and chemical ingredients for formulators and manufacturers.' },
    { path: '/categories', metaTitle: 'Ingredient Categories | CocoJojoChem', metaDescription: 'Browse wholesale ingredient categories including acids, oils, surfactants, and more.' },
    { path: '/products', metaTitle: 'All Products | CocoJojoChem', metaDescription: 'Browse our full wholesale catalog of cosmetic and chemical ingredients.' },
  ];
  let seoAdded = 0;
  for (const p of SEO_PAGES) {
    const existing = await seoRepo.findOne({ where: { path: p.path } });
    if (existing) continue;
    await seoRepo.save(seoRepo.create(p));
    seoAdded++;
  }

  console.log(
    `Seeded ${companiesAdded} companies, ${testimonialsAdded} testimonials, ${ordersAdded} orders, ` +
      `${quotesAdded} quote requests, ${newsletterAdded} newsletter subscribers, ${seoAdded} SEO pages ` +
      `(skipped any already present).`,
  );

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
