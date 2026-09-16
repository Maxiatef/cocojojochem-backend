import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Role,
  Category,
  Function,
  Certification,
  Product,
  ProductVariant,
  ProductImage,
  ProductDocument,
  ProductSpec,
  ProductSeo,
  Company,
  User,
  RefreshToken,
  PasswordResetRequest,
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
  PageView,
  ShippingRateTier,
  QuoteListItem,
  PendingCheckout,
  AuditLog,
  WishlistItem,
} from './entities';

import { RolesModule } from './modules/roles/roles.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { FunctionsModule } from './modules/functions/functions.module';
import { CertificationsModule } from './modules/certifications/certifications.module';
import { ProductsModule } from './modules/products/products.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { QuoteListModule } from './modules/quote-list/quote-list.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
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
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { HealthModule } from './modules/health/health.module';
import { ShippingRateTiersModule } from './modules/shipping-rate-tiers/shipping-rate-tiers.module';
// Re-enabled: the per-page SEO fields in the admin SEO table edit these rows,
// and the storefront's generateMetadata() on /, /products, /categories,
// /functions and /a-z already calls `GET /seo-pages/by-path`. While this was
// commented out every one of those calls 404'd on each render and fell back to
// its hardcoded default.
import { SeoPagesModule } from './modules/seo-pages/seo-pages.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';
import { SeoAnalyzerModule } from './modules/seo-analyzer/seo-analyzer.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AuditInterceptor } from './common/audit/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Global baseline: 100 requests/min per IP. Sensitive routes (login, register,
    // guest checkout, coupon validation, contact/newsletter forms) override this
    // with a tighter limit via @Throttle() directly on their controller methods.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'cocojojochem',
      // TLS on by default for any non-local host. Managed Postgres (Clever
      // Cloud, Neon, Render, RDS) requires it, and deriving it from the host
      // rather than a separate flag means a deploy cannot be one forgotten
      // env var away from failing to connect. DB_SSL=true/false overrides.
      //
      // rejectUnauthorized:false accepts the provider's certificate without
      // checking it against a CA bundle — these providers use self-signed
      // certs, and it is what their own connection examples do. The
      // connection is still encrypted. Set DB_SSL_REJECT_UNAUTHORIZED=true
      // once you ship a CA bundle.
      ssl: (() => {
        const host = process.env.DB_HOST || 'localhost';
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        const enabled =
          process.env.DB_SSL === 'true' ? true : process.env.DB_SSL === 'false' ? false : !isLocal;
        return enabled
          ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' }
          : false;
      })(),
      // ONE connection per process, not node-postgres' default of 10.
      //
      // The database allows about 5 connections for the whole role, and that
      // budget is shared by everything using it: every warm serverless
      // instance, local development, and any psql session. Serverless scales
      // out by creating processes and each one wants its own pool, so the
      // usable number is (instances x max) — there is no pool size that keeps
      // N x max under 5 for unbounded N. 1 is simply the most instances that
      // can coexist, and it is a ceiling rather than a fix.
      //
      // A single connection is enough because requests to one instance are
      // served sequentially anyway; what it costs is pipelining within an
      // instance, which is not the bottleneck here.
      //
      // The real fix is a database with a connection pooler in front of it
      // (PgBouncer, as Neon and Supabase provide) or a long-lived host where
      // one process owns the pool. See DEPLOY.md.
      extra: { max: Number(process.env.DB_POOL_MAX) || 1 },
      entities: [
        Role,
        Category,
        Function,
        Certification,
        Product,
        ProductVariant,
        ProductImage,
        ProductDocument,
        ProductSpec,
        ProductSeo,
        Company,
        User,
        RefreshToken,
        PasswordResetRequest,
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
        PageView,
        ShippingRateTier,
        QuoteListItem,
  PendingCheckout,
  AuditLog,
  WishlistItem,
      ],
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      // Applying migrations on boot is right for a single long-lived process
      // and wrong for a serverless one, where every cold start is a boot and
      // several can race to apply the same migration. Set RUN_MIGRATIONS=false
      // there and run `npm run migration:run` as a deploy step instead.
      migrationsRun: process.env.RUN_MIGRATIONS !== 'false',
      synchronize: false,
      logging: ['error', 'warn'],
      // Default is 10 retries at 3s apart. On a serverless runtime that means
      // a request sits for 30 seconds and then the function is killed by its
      // own timeout, so the real connection error is never logged. Fail fast
      // and let the error surface instead.
      retryAttempts: Number(process.env.DB_RETRY_ATTEMPTS ?? 2),
      retryDelay: 1000,
      connectTimeoutMS: 10000,
    }),
    RolesModule,
    CategoriesModule,
    FunctionsModule,
    CertificationsModule,
    ProductsModule,
    UsersModule,
    CompaniesModule,
    AuthModule,
    CartModule,
    QuoteListModule,
    WishlistModule,
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
    AnalyticsModule,
    TrackingModule,
    HealthModule,
    ShippingRateTiersModule,
    SeoPagesModule,
    SiteSettingsModule,
    SeoAnalyzerModule,
    AuditLogModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Opens the per-request audit context. Guards run before interceptors, so
    // req.user is already populated by the time this sees the request.
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
