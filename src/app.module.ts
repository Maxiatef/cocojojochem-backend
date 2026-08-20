import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Category,
  Function,
  Certification,
  Product,
  ProductVariant,
  ProductImage,
  ProductDocument,
  ProductSpec,
  Company,
  User,
  Cart,
  CartItem,
  Order,
  OrderItem,
  QuoteRequest,
  QuoteRequestItem,
  Testimonial,
  NewsletterSubscriber,
  SeoPage,
  ContactMessage,
  Coupon,
  CouponUsage,
  BulkSaleDiscount,
  SiteSetting,
  SeoMetric,
  SeoIssue,
} from './entities';

import { CategoriesModule } from './modules/categories/categories.module';
import { FunctionsModule } from './modules/functions/functions.module';
import { CertificationsModule } from './modules/certifications/certifications.module';
import { ProductsModule } from './modules/products/products.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { OrdersModule } from './modules/orders/orders.module';
import { QuoteRequestsModule } from './modules/quote-requests/quote-requests.module';
import { TestimonialsModule } from './modules/testimonials/testimonials.module';
import { NewsletterModule } from './modules/newsletter/newsletter.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { UploadModule } from './modules/upload/upload.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ContactMessagesModule } from './modules/contact-messages/contact-messages.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { BulkSalesModule } from './modules/bulk-sales/bulk-sales.module';
// SeoPagesModule is disabled — no admin UI edits SeoPage rows anymore (the
// Meta Tags editor tab on /admin/seo was removed). Left commented, not
// deleted, so it can be re-enabled later. Note: with this commented out,
// `GET /seo-pages/by-path` 404s, and the storefront's generateMetadata()
// calls on /, /products, /categories, /functions, /a-z gracefully fall back
// to their hardcoded default titles/descriptions (serverFetch treats a
// non-ok response as "no override" rather than throwing) — any previously
// saved per-path overrides simply stop applying until this is uncommented.
// import { SeoPagesModule } from './modules/seo-pages/seo-pages.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';
import { SeoAnalyzerModule } from './modules/seo-analyzer/seo-analyzer.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'cocojojochem',
      entities: [
        Category,
        Function,
        Certification,
        Product,
        ProductVariant,
        ProductImage,
        ProductDocument,
        ProductSpec,
        Company,
        User,
        Cart,
        CartItem,
        Order,
        OrderItem,
        QuoteRequest,
        QuoteRequestItem,
        Testimonial,
        NewsletterSubscriber,
        SeoPage,
        ContactMessage,
        Coupon,
        CouponUsage,
        BulkSaleDiscount,
        SiteSetting,
        SeoMetric,
        SeoIssue,
      ],
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      migrationsRun: true,
      synchronize: false,
      logging: ['error', 'warn'],
    }),
    CategoriesModule,
    FunctionsModule,
    CertificationsModule,
    ProductsModule,
    UsersModule,
    CompaniesModule,
    AuthModule,
    CartModule,
    OrdersModule,
    QuoteRequestsModule,
    TestimonialsModule,
    NewsletterModule,
    DashboardModule,
    UploadModule,
    WebhooksModule,
    ContactMessagesModule,
    CouponsModule,
    BulkSalesModule,
    // SeoPagesModule, // disabled — see comment above the import
    SiteSettingsModule,
    SeoAnalyzerModule,
  ],
})
export class AppModule {}
