import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderItem, OrderStatus, Product, ProductVariant, StockStatus } from '../../entities';

// Same worst-case precedence used across the admin (products list, dashboard):
// a single OUT_OF_STOCK variant dominates the whole product's badge, then
// ON_BACKORDER, and only IN_STOCK when every variant is fine.
function worstStockStatus(statuses: string[]): string {
  if (statuses.includes(StockStatus.OUT_OF_STOCK)) return StockStatus.OUT_OF_STOCK;
  if (statuses.includes(StockStatus.ON_BACKORDER)) return StockStatus.ON_BACKORDER;
  return StockStatus.IN_STOCK;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemsRepo: Repository<OrderItem>,
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductVariant) private readonly variantsRepo: Repository<ProductVariant>,
  ) {}

  async getSalesAndProducts(daysRaw: number) {
    const days = [7, 30, 90, 365].includes(daysRaw) ? daysRaw : 30;
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

    const [
      revenueSeries,
      revenueTotals,
      productRows,
      categoryRows,
      companyRows,
      slowMoverRows,
    ] = await Promise.all([
      this.ordersRepo
        .createQueryBuilder('order')
        .select("DATE_TRUNC('day', order.createdAt)", 'day')
        .addSelect('COALESCE(SUM(order.total), 0)', 'revenue')
        .addSelect('COUNT(*)', 'orderCount')
        .where(`order.createdAt >= NOW() - INTERVAL '${days} days'`)
        .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
        .groupBy('day')
        .orderBy('day', 'ASC')
        .getRawMany(),
      this.ordersRepo
        .createQueryBuilder('order')
        .select('COALESCE(SUM(order.total), 0)', 'totalRevenue')
        .addSelect('COUNT(*)', 'totalOrders')
        .where(`order.createdAt >= NOW() - INTERVAL '${days} days'`)
        .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
        .getRawOne(),
      this.orderItemsRepo
        .createQueryBuilder('item')
        .innerJoin('item.order', 'order')
        .leftJoin('item.variant', 'variant')
        .leftJoin('variant.product', 'product')
        .leftJoin('product.category', 'category')
        .select('product.id', 'productId')
        .addSelect('product.name', 'name')
        .addSelect('category.id', 'categoryId')
        .addSelect('category.name', 'categoryName')
        .addSelect('SUM(item.quantity)', 'unitsSold')
        .addSelect('SUM(item.price * item.quantity)', 'revenue')
        .addSelect('COUNT(DISTINCT item.orderId)', 'orderCount')
        .where(`order.createdAt >= NOW() - INTERVAL '${days} days'`)
        .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
        .andWhere('product.id IS NOT NULL')
        .groupBy('product.id')
        .addGroupBy('product.name')
        .addGroupBy('category.id')
        .addGroupBy('category.name')
        .orderBy('revenue', 'DESC')
        .getRawMany(),
      this.orderItemsRepo
        .createQueryBuilder('item')
        .innerJoin('item.order', 'order')
        .leftJoin('item.variant', 'variant')
        .leftJoin('variant.product', 'product')
        .leftJoin('product.category', 'category')
        .select('category.id', 'categoryId')
        .addSelect('category.name', 'name')
        .addSelect('SUM(item.quantity)', 'unitsSold')
        .addSelect('SUM(item.price * item.quantity)', 'revenue')
        .where(`order.createdAt >= NOW() - INTERVAL '${days} days'`)
        .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
        .andWhere('category.id IS NOT NULL')
        .groupBy('category.id')
        .addGroupBy('category.name')
        .orderBy('revenue', 'DESC')
        .getRawMany(),
      this.orderItemsRepo
        .createQueryBuilder('item')
        .innerJoin('item.order', 'order')
        .innerJoin('order.user', 'user')
        .innerJoin('user.company', 'company')
        .select('company.id', 'companyId')
        .addSelect('company.name', 'name')
        .addSelect('SUM(item.price * item.quantity)', 'revenue')
        .addSelect('COUNT(DISTINCT item.orderId)', 'orderCount')
        .where(`order.createdAt >= NOW() - INTERVAL '${days} days'`)
        .andWhere('order.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
        .groupBy('company.id')
        .addGroupBy('company.name')
        .orderBy('revenue', 'DESC')
        .limit(10)
        .getRawMany(),
      this.productsRepo
        .createQueryBuilder('product')
        .leftJoin('product.category', 'category')
        .select('product.id', 'productId')
        .addSelect('product.name', 'name')
        .addSelect('category.name', 'categoryName')
        .addSelect('product.createdAt', 'createdAt')
        .where('product.isPublished = true')
        .andWhere(
          `NOT EXISTS (
            SELECT 1 FROM order_items oi
            INNER JOIN product_variants pv ON pv.id = oi."productVariantId"
            INNER JOIN orders o ON o.id = oi."orderId"
            WHERE pv."productId" = product.id
              AND o."createdAt" >= NOW() - INTERVAL '${days} days'
              AND o.status != :cancelled
          )`,
          { cancelled: OrderStatus.CANCELLED },
        )
        .orderBy('product.createdAt', 'ASC')
        .limit(50)
        .getRawMany(),
    ]);

    // Second follow-up aggregation: worst-case stock status per product that
    // had sales, over its *current* variants (not the ones sold historically).
    const productIds = productRows.map((r) => Number(r.productId));
    let stockByProduct = new Map<number, string>();
    if (productIds.length > 0) {
      const variants = await this.variantsRepo
        .createQueryBuilder('variant')
        .select('variant.productId', 'productId')
        .addSelect('variant.stockStatus', 'stockStatus')
        .where('variant.productId IN (:...productIds)', { productIds })
        .getRawMany();
      const grouped = new Map<number, string[]>();
      for (const v of variants) {
        const pid = Number(v.productId);
        if (!grouped.has(pid)) grouped.set(pid, []);
        grouped.get(pid)!.push(v.stockStatus);
      }
      stockByProduct = new Map(
        Array.from(grouped.entries()).map(([pid, statuses]) => [pid, worstStockStatus(statuses)]),
      );
    }

    return {
      range: { days, from: from.toISOString(), to: to.toISOString() },
      revenue: {
        series: revenueSeries.map((r) => ({
          day: r.day,
          revenue: Number(r.revenue),
          orderCount: Number(r.orderCount),
        })),
        totalRevenue: Number(revenueTotals?.totalRevenue || 0),
        totalOrders: Number(revenueTotals?.totalOrders || 0),
        avgOrderValue:
          Number(revenueTotals?.totalOrders || 0) > 0
            ? Number(revenueTotals.totalRevenue) / Number(revenueTotals.totalOrders)
            : 0,
      },
      products: productRows.map((r) => ({
        productId: Number(r.productId),
        name: r.name,
        categoryName: r.categoryName ?? null,
        unitsSold: Number(r.unitsSold),
        revenue: Number(r.revenue),
        orderCount: Number(r.orderCount),
        stockStatus: stockByProduct.get(Number(r.productId)) || StockStatus.IN_STOCK,
      })),
      categories: categoryRows.map((r) => ({
        categoryId: Number(r.categoryId),
        name: r.name,
        revenue: Number(r.revenue),
        unitsSold: Number(r.unitsSold),
      })),
      topCompanies: companyRows.map((r) => ({
        companyId: Number(r.companyId),
        name: r.name,
        revenue: Number(r.revenue),
        orderCount: Number(r.orderCount),
      })),
      slowMovers: slowMoverRows.map((r) => ({
        productId: Number(r.productId),
        name: r.name,
        categoryName: r.categoryName ?? null,
        createdAt: r.createdAt,
      })),
    };
  }
}
