import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Category,
  Company,
  NewsletterSubscriber,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductVariant,
  QuoteRequest,
  RequestStatus,
} from '../../entities';

// Matches the real cocojojo.com admin dashboard's low-stock threshold (their
// getLowStockProducts() uses the same cutoff — see TODO.md for the comparison).
const LOW_STOCK_THRESHOLD = 10;

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variantsRepo: Repository<ProductVariant>,
    @InjectRepository(Category) private readonly categoriesRepo: Repository<Category>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectRepository(QuoteRequest) private readonly quoteRequestsRepo: Repository<QuoteRequest>,
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemsRepo: Repository<OrderItem>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscribersRepo: Repository<NewsletterSubscriber>,
  ) {}

  // The admin dashboard home: one call, several parallel counts/aggregates/joins
  // across catalog, accounts, leads, revenue, and fulfillment — everything a
  // real commerce admin's landing page needs, not just a handful of counters.
  async getOverview() {
    const [
      productCount,
      categoryCount,
      companyCount,
      newQuoteRequestCount,
      totalQuoteRequestCount,
      pendingOrderCount,
      subscriberCount,
      revenue,
      revenueLast30Days,
      orderStatusBreakdown,
      topProducts,
      outOfStockCount,
      onBackorderCount,
      lowStockCount,
      lowStockVariants,
      recentOrders,
    ] = await Promise.all([
      this.productsRepo.count({ where: { isPublished: true } }),
      this.categoriesRepo.count(),
      this.companiesRepo.count(),
      this.quoteRequestsRepo.count({ where: { status: RequestStatus.NEW } }),
      this.quoteRequestsRepo.count(),
      this.ordersRepo.count({ where: { status: OrderStatus.PENDING } }),
      this.subscribersRepo.count(),
      this.ordersRepo
        .createQueryBuilder('order')
        .select('COALESCE(SUM(order.total), 0)', 'total')
        .where('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
        .getRawOne(),
      this.ordersRepo
        .createQueryBuilder('order')
        .select("DATE_TRUNC('day', order.createdAt)", 'day')
        .addSelect('COALESCE(SUM(order.total), 0)', 'revenue')
        .addSelect('COUNT(*)', 'orderCount')
        .where("order.createdAt >= NOW() - INTERVAL '30 days'")
        .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
        .groupBy('day')
        .orderBy('day', 'ASC')
        .getRawMany(),
      this.ordersRepo
        .createQueryBuilder('order')
        .select('order.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('order.status')
        .getRawMany(),
      this.orderItemsRepo
        .createQueryBuilder('item')
        .select('item.productName', 'name')
        .addSelect('SUM(item.quantity)', 'unitsSold')
        .addSelect('SUM(item.price * item.quantity)', 'revenue')
        .groupBy('item.productName')
        .orderBy('revenue', 'DESC')
        .limit(5)
        .getRawMany(),
      this.variantsRepo.count({ where: { stockStatus: 'OUT_OF_STOCK' as any } }),
      this.variantsRepo.count({ where: { stockStatus: 'ON_BACKORDER' as any } }),
      // Variants still marked IN_STOCK but running low — same "still sellable,
      // running out" signal the real cocojojo.com's admin dashboard surfaces
      // (their getLowStockProducts(), quantity between 1 and a threshold).
      this.variantsRepo
        .createQueryBuilder('variant')
        .where('variant.stockStatus = :status', { status: 'IN_STOCK' })
        .andWhere('variant.stockQuantity IS NOT NULL')
        .andWhere('variant.stockQuantity > 0')
        .andWhere('variant.stockQuantity <= COALESCE(variant.lowStockThreshold, :threshold)', {
          threshold: LOW_STOCK_THRESHOLD,
        })
        .getCount(),
      // We also report the actual list (capped at 10), not just a count, so
      // the overview card is directly actionable rather than a number the
      // admin has to go look up elsewhere.
      this.variantsRepo
        .createQueryBuilder('variant')
        .leftJoin('variant.product', 'product')
        .select('variant.id', 'variantId')
        .addSelect('variant.label', 'variantLabel')
        .addSelect('variant.sku', 'sku')
        .addSelect('variant.stockQuantity', 'stockQuantity')
        .addSelect('product.id', 'productId')
        .addSelect('product.name', 'productName')
        .addSelect('product.slug', 'productSlug')
        .where('variant.stockStatus = :status', { status: 'IN_STOCK' })
        .andWhere('variant.stockQuantity IS NOT NULL')
        .andWhere('variant.stockQuantity > 0')
        .andWhere('variant.stockQuantity <= COALESCE(variant.lowStockThreshold, :threshold)', {
          threshold: LOW_STOCK_THRESHOLD,
        })
        .orderBy('variant.stockQuantity', 'ASC')
        .limit(10)
        .getRawMany(),
      this.ordersRepo
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.user', 'user')
        .orderBy('order.createdAt', 'DESC')
        .take(6)
        .getMany(),
    ]);

    return {
      catalog: { productCount, categoryCount },
      accounts: { companyCount },
      leads: { newQuoteRequestCount, totalQuoteRequestCount },
      orders: {
        pendingOrderCount,
        totalRevenue: Number(revenue.total),
        statusBreakdown: orderStatusBreakdown.map((r) => ({ status: r.status, count: Number(r.count) })),
        recent: recentOrders.map((o) => ({
          id: o.id,
          status: o.status,
          total: o.total,
          createdAt: o.createdAt,
          customerName: o.user?.fullName || null,
          customerEmail: o.user?.email || null,
        })),
      },
      revenue: {
        last30Days: revenueLast30Days.map((r) => ({
          day: r.day,
          revenue: Number(r.revenue),
          orderCount: Number(r.orderCount),
        })),
      },
      inventory: {
        outOfStockCount,
        onBackorderCount,
        lowStockCount,
        lowStockProducts: lowStockVariants.map((v) => ({
          variantId: Number(v.variantId),
          variantLabel: v.variantLabel,
          sku: v.sku,
          stockQuantity: Number(v.stockQuantity),
          productId: Number(v.productId),
          productName: v.productName,
          productSlug: v.productSlug,
        })),
      },
      topProducts: topProducts.map((p) => ({
        name: p.name,
        unitsSold: Number(p.unitsSold),
        revenue: Number(p.revenue),
      })),
      marketing: { subscriberCount },
    };
  }
}
