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
import { SeoPagesModule } from './modules/seo-pages/seo-pages.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';

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
    SeoPagesModule,
    SiteSettingsModule,
  ],
})
export class AppModule {}
