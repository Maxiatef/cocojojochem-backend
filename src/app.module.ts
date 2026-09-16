import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Role,
  Team,
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
import { TeamsModule } from './modules/teams/teams.module';
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
      entities: [
        Role,
        Team,
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
      migrationsRun: true,
      synchronize: false,
      logging: ['error', 'warn'],
      // Cap on simultaneous connections THIS process holds open.
      //
      // Default 2 rather than node-postgres' 10 because the managed Postgres
      // this connects to allows about 5 connections for the whole role — and
      // that budget is shared by every process using it: the local dev server,
      // a deployed instance, and any psql session you have open. One process
      // grabbing 10 is what produces `too many connections for role ...`, and
      // it locks everyone else out rather than slowing itself down.
      //
      // Raise it with DB_POOL_MAX on a host with a real connection allowance;
      // 2 is enough for development, where requests arrive one at a time.
      extra: { max: Number(process.env.DB_POOL_MAX) || 2 },
    }),
    RolesModule,
    TeamsModule,
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
