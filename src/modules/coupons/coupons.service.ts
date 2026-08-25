import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import {
  Coupon,
  CouponType,
  CouponUsage,
  Order,
  OrderItem,
  Product,
  Category,
  ProductVariant,
} from '../../entities';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { QueryCouponsDto } from './dto/query-coupons.dto';
import { ValidateCouponDto, ValidateCouponCartItemDto } from './dto/validate-coupon.dto';
// Sale status for excludeSaleItems comes from the trusted client-supplied
// item.isOnSale flag (see ValidateCouponCartItemDto) rather than a DB
// lookup here — see common/pricing.util.ts's isSaleActive() for how the
// storefront computes that flag in the first place.

function parseIds(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

// Wildcard email match used by Coupon.allowedEmails: a leading "*" matches
// any prefix (e.g. "*@company.com"); a pattern with no "*" must match the
// full email exactly. Always case-insensitive.
function emailMatchesPattern(email: string, pattern: string): boolean {
  const e = email.toLowerCase();
  const p = pattern.toLowerCase().trim();
  if (p.startsWith('*')) return e.endsWith(p.slice(1));
  return e === p;
}

@Injectable()
export class CouponsService {
  private readonly logger = new Logger('Coupons');

  constructor(
    @InjectRepository(Coupon)
    private readonly couponsRepo: Repository<Coupon>,
    @InjectRepository(CouponUsage)
    private readonly couponUsageRepo: Repository<CouponUsage>,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepo: Repository<OrderItem>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
  ) {}

  async findAll(query: QueryCouponsDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const qb = this.couponsRepo.createQueryBuilder('coupon');

    if (query.search) {
      qb.andWhere('(coupon.code ILIKE :search OR coupon.description ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.type) {
      qb.andWhere('coupon.type = :type', { type: query.type });
    }
    if (query.isActive != null) {
      qb.andWhere('coupon.isActive = :isActive', { isActive: query.isActive === 'true' });
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`coupon.${sortBy}`, sortOrder);

    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number) {
    const coupon = await this.couponsRepo.findOne({ where: { id } });
    if (!coupon) throw new NotFoundException(`Coupon #${id} not found`);
    return coupon;
  }

  async create(dto: CreateCouponDto) {
    const coupon = this.couponsRepo.create({
      ...dto,
      code: dto.code.toUpperCase(),
      value: String(dto.value),
      minOrderAmount: dto.minOrderAmount != null ? String(dto.minOrderAmount) : null,
      maxOrderAmount: dto.maxOrderAmount != null ? String(dto.maxOrderAmount) : null,
      maxDiscount: dto.maxDiscount != null ? String(dto.maxDiscount) : null,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      excludedCategoryIds: dto.excludedCategoryIds ? JSON.stringify(dto.excludedCategoryIds) : null,
      excludedProductIds: dto.excludedProductIds ? JSON.stringify(dto.excludedProductIds) : null,
      excludedVariantIds: dto.excludedVariantIds ? JSON.stringify(dto.excludedVariantIds) : null,
      includedCategoryIds: dto.includedCategoryIds ? JSON.stringify(dto.includedCategoryIds) : null,
      includedProductIds: dto.includedProductIds ? JSON.stringify(dto.includedProductIds) : null,
      includedVariantIds: dto.includedVariantIds ? JSON.stringify(dto.includedVariantIds) : null,
      allowedEmails: dto.allowedEmails && dto.allowedEmails.length ? dto.allowedEmails : null,
      includedBrands: dto.includedBrands && dto.includedBrands.length ? dto.includedBrands : null,
      excludedBrands: dto.excludedBrands && dto.excludedBrands.length ? dto.excludedBrands : null,
    });
    const saved = await this.couponsRepo.save(coupon);
    this.logger.log(`Coupon created: ${saved.code} (id=${saved.id})`);
    return saved;
  }

  async update(id: number, dto: UpdateCouponDto) {
    const coupon = await this.findOne(id);
    const patch: any = { ...dto };
    if (dto.code) patch.code = dto.code.toUpperCase();
    if (dto.value != null) patch.value = String(dto.value);
    if (dto.minOrderAmount !== undefined) patch.minOrderAmount = dto.minOrderAmount != null ? String(dto.minOrderAmount) : null;
    if (dto.maxOrderAmount !== undefined) patch.maxOrderAmount = dto.maxOrderAmount != null ? String(dto.maxOrderAmount) : null;
    if (dto.maxDiscount !== undefined) patch.maxDiscount = dto.maxDiscount != null ? String(dto.maxDiscount) : null;
    if (dto.startDate !== undefined) patch.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) patch.endDate = dto.endDate ? new Date(dto.endDate) : null;
    for (const key of [
      'excludedCategoryIds',
      'excludedProductIds',
      'excludedVariantIds',
      'includedCategoryIds',
      'includedProductIds',
      'includedVariantIds',
    ] as const) {
      if (dto[key] !== undefined) patch[key] = dto[key] ? JSON.stringify(dto[key]) : null;
    }
    for (const key of ['allowedEmails', 'includedBrands', 'excludedBrands'] as const) {
      if (dto[key] !== undefined) patch[key] = dto[key] && dto[key]!.length ? dto[key] : null;
    }
    Object.assign(coupon, patch);
    const saved = await this.couponsRepo.save(coupon);
    this.logger.log(`Coupon updated: ${saved.code} (id=${saved.id})`);
    return saved;
  }

  async remove(id: number) {
    const coupon = await this.findOne(id);
    await this.couponsRepo.remove(coupon);
    this.logger.log(`Coupon deleted: ${coupon.code} (id=${id})`);
    return { success: true };
  }

  // Determines which cart items are eligible for a coupon's restrictions:
  // exclusion always wins first; then, if any include-list is configured,
  // the item must match one of them. If both applicableToAll* flags are true
  // and no include lists are set, everything not excluded is eligible.
  private getEligibleItems(coupon: Coupon, cartItems: ValidateCouponCartItemDto[]) {
    const excludedCategoryIds = parseIds(coupon.excludedCategoryIds);
    const excludedProductIds = parseIds(coupon.excludedProductIds);
    const excludedVariantIds = parseIds(coupon.excludedVariantIds);
    const includedCategoryIds = parseIds(coupon.includedCategoryIds);
    const includedProductIds = parseIds(coupon.includedProductIds);
    const includedVariantIds = parseIds(coupon.includedVariantIds);
    const excludedBrands = (coupon.excludedBrands || []).map((b) => b.toLowerCase());
    const includedBrands = (coupon.includedBrands || []).map((b) => b.toLowerCase());

    const hasIncludeList =
      includedCategoryIds.length > 0 ||
      includedProductIds.length > 0 ||
      includedVariantIds.length > 0 ||
      includedBrands.length > 0;

    let eligible = cartItems.filter((item) => {
      if (item.variantId && excludedVariantIds.includes(item.variantId)) return false;
      if (item.productId && excludedProductIds.includes(item.productId)) return false;
      if (item.categoryId && excludedCategoryIds.includes(item.categoryId)) return false;
      if (item.brand && excludedBrands.includes(item.brand.toLowerCase())) return false;

      // excludeSaleItems: relies on the trusted client-supplied isOnSale
      // flag (see ValidateCouponCartItemDto) — a currently-on-sale item is
      // never eligible when this restriction is enabled, regardless of
      // what the category/product/variant/brand rules would otherwise allow.
      if (coupon.excludeSaleItems && item.isOnSale) return false;

      if (!hasIncludeList) {
        // No explicit include list — everything not excluded is eligible
        // as long as the coupon applies broadly.
        if (coupon.applicableToAllCategories && coupon.applicableToAllProducts) return true;
        // Fall through: treat missing include lists as "all" when the
        // relevant applicableToAll flag is true.
        return true;
      }

      if (item.variantId && includedVariantIds.includes(item.variantId)) return true;
      if (item.productId && includedProductIds.includes(item.productId)) return true;
      if (item.categoryId && includedCategoryIds.includes(item.categoryId)) return true;
      if (item.brand && includedBrands.includes(item.brand.toLowerCase())) return true;
      return false;
    });

    // limitUsageToXItems caps how many distinct eligible cart LINES (not
    // total quantity) receive the discount, matching WooCommerce's
    // "Customers can apply the coupon to a maximum of X items" semantics.
    // Applied after exclusion/inclusion filtering, before discount amounts
    // are computed — items beyond the cap stay at full price.
    if (coupon.limitUsageToXItems != null && eligible.length > coupon.limitUsageToXItems) {
      eligible = eligible.slice(0, coupon.limitUsageToXItems);
    }

    return eligible;
  }

  async validateCoupon(dto: ValidateCouponDto) {
    const code = dto.code.trim().toUpperCase();
    const coupon = await this.couponsRepo.findOne({ where: { code } });

    if (!coupon) {
      return { isValid: false, message: 'Coupon code not found' };
    }
    if (!coupon.isActive) {
      return { isValid: false, coupon, message: 'This coupon is no longer active' };
    }

    const now = new Date();
    if (coupon.startDate && now < new Date(coupon.startDate)) {
      return { isValid: false, coupon, message: 'This coupon is not yet active' };
    }
    if (coupon.endDate && now > new Date(coupon.endDate)) {
      return { isValid: false, coupon, message: 'This coupon has expired' };
    }

    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
      return { isValid: false, coupon, message: 'This coupon has reached its usage limit' };
    }

    if (dto.email && coupon.maxUsagePerUser != null) {
      const userUsageCount = await this.couponUsageRepo.count({
        where: { couponId: coupon.id, email: dto.email.toLowerCase() },
      });
      if (userUsageCount >= coupon.maxUsagePerUser) {
        return { isValid: false, coupon, message: 'You have already used this coupon the maximum number of times' };
      }
    }

    if (coupon.allowedEmails != null && coupon.allowedEmails.length > 0) {
      if (!dto.email) {
        return {
          isValid: false,
          coupon,
          message: 'This coupon is restricted to specific email addresses',
        };
      }
      const matches = coupon.allowedEmails.some((pattern) => emailMatchesPattern(dto.email as string, pattern));
      if (!matches) {
        return {
          isValid: false,
          coupon,
          message: 'This coupon is not valid for your email address',
        };
      }
    }

    // Raw (pre-restriction) check first — if the cart's raw total is
    // already below minOrderAmount / above maxOrderAmount, that message
    // should win before any eligibility-filtering message does.
    if (coupon.minOrderAmount != null && dto.orderAmount < Number(coupon.minOrderAmount)) {
      return {
        isValid: false,
        coupon,
        message: `Minimum order amount of $${coupon.minOrderAmount} required`,
      };
    }
    if (coupon.maxOrderAmount != null && dto.orderAmount > Number(coupon.maxOrderAmount)) {
      return {
        isValid: false,
        coupon,
        message: `This coupon can only be used on orders up to $${coupon.maxOrderAmount}`,
      };
    }

    const cartItems = dto.cartItems || [];
    const eligibleItems = cartItems.length ? this.getEligibleItems(coupon, cartItems) : [];
    const eligibleAmount = cartItems.length
      ? eligibleItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
      : dto.orderAmount;

    if (cartItems.length && eligibleItems.length === 0) {
      return {
        isValid: false,
        coupon,
        message: 'No items in your cart are eligible for this coupon',
        eligibleItemsCount: 0,
        totalItemsCount: cartItems.length,
      };
    }

    // Re-check against the eligible (post-restriction) amount too — the raw
    // check above catches the cart-wide case, but eligibility filtering can
    // still push the relevant amount below/above the threshold.
    if (coupon.minOrderAmount != null && eligibleAmount < Number(coupon.minOrderAmount)) {
      return {
        isValid: false,
        coupon,
        message: `Minimum order amount of $${coupon.minOrderAmount} required`,
      };
    }
    if (coupon.maxOrderAmount != null && eligibleAmount > Number(coupon.maxOrderAmount)) {
      return {
        isValid: false,
        coupon,
        message: `This coupon can only be used on orders up to $${coupon.maxOrderAmount}`,
      };
    }

    // Discount-amount calculation for all 4 CouponType values.
    // PERCENTAGE_PRODUCT and PERCENTAGE_CART converge on the same raw
    // pre-cap total (sum of item.price*qty*pct% == eligibleAmount*pct%),
    // but are kept as genuinely separate code paths since the distinction
    // matters if/when per-item capping is introduced later.
    let discountAmount: number;
    if (coupon.type === CouponType.PERCENTAGE_CART) {
      discountAmount = eligibleAmount * (Number(coupon.value) / 100);
    } else if (coupon.type === CouponType.PERCENTAGE_PRODUCT) {
      const pct = Number(coupon.value) / 100;
      discountAmount = eligibleItems.length
        ? eligibleItems.reduce((sum, item) => sum + item.price * item.quantity * pct, 0)
        : eligibleAmount * pct;
    } else if (coupon.type === CouponType.FIXED_PRODUCT) {
      const flat = Number(coupon.value);
      discountAmount = eligibleItems.length
        ? eligibleItems.reduce((sum, item) => {
            const lineTotal = item.price * item.quantity;
            const lineDiscount = Math.min(flat * item.quantity, lineTotal);
            return sum + lineDiscount;
          }, 0)
        : Math.min(flat, eligibleAmount);
    } else {
      // FIXED_CART — flat amount off the whole eligible subtotal once.
      discountAmount = Number(coupon.value);
    }

    if (coupon.maxDiscount != null) {
      discountAmount = Math.min(discountAmount, Number(coupon.maxDiscount));
    }
    discountAmount = Math.min(discountAmount, eligibleAmount);
    discountAmount = Math.round(discountAmount * 100) / 100;

    const finalAmount = Math.max(0, dto.orderAmount - discountAmount);

    return {
      isValid: true,
      coupon,
      discountAmount,
      finalAmount,
      eligibleItemsCount: cartItems.length ? eligibleItems.length : undefined,
      totalItemsCount: cartItems.length ? cartItems.length : undefined,
    };
  }

  async incrementUsage(couponId: number, email: string, orderId: number | null) {
    await this.couponsRepo.increment({ id: couponId }, 'usageCount', 1);
    const usage = this.couponUsageRepo.create({
      couponId,
      email: email.toLowerCase(),
      orderId: orderId ?? null,
    });
    await this.couponUsageRepo.save(usage);
    this.logger.log(`Coupon #${couponId} usage recorded for ${email}${orderId ? ` (order #${orderId})` : ''}`);
  }

  async getAnalyticsAll() {
    const total = await this.couponsRepo.count();
    const active = await this.couponsRepo.count({ where: { isActive: true } });
    const now = new Date();
    const expired = await this.couponsRepo
      .createQueryBuilder('coupon')
      .where('coupon.endDate IS NOT NULL AND coupon.endDate < :now', { now })
      .getCount();

    const totalDiscountGiven = await this.ordersRepo
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.couponAmount), 0)', 'sum')
      .where('order.couponAmount > 0')
      .getRawOne();

    const totalUsages = await this.couponUsageRepo.count();

    const topUsers = await this.couponUsageRepo
      .createQueryBuilder('usage')
      .select('usage.email', 'email')
      .addSelect('COUNT(*)', 'usageCount')
      .groupBy('usage.email')
      .orderBy('"usageCount"', 'DESC')
      .limit(10)
      .getRawMany();

    const topProducts = await this.orderItemsRepo
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .select('item.productName', 'productName')
      .addSelect('SUM(item.quantity)', 'quantitySold')
      .where('order.couponAmount > 0')
      .groupBy('item.productName')
      .orderBy('"quantitySold"', 'DESC')
      .limit(10)
      .getRawMany();

    const topCoupons = await this.couponUsageRepo
      .createQueryBuilder('usage')
      .innerJoin('usage.coupon', 'coupon')
      .select('coupon.id', 'couponId')
      .addSelect('coupon.code', 'code')
      .addSelect('COUNT(*)', 'usageCount')
      .groupBy('coupon.id')
      .addGroupBy('coupon.code')
      .orderBy('"usageCount"', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      totalCoupons: total,
      activeCoupons: active,
      inactiveCoupons: total - active,
      expiredCoupons: expired,
      totalDiscountGiven: Number(totalDiscountGiven?.sum || 0),
      totalUsages,
      topUsers,
      topProducts,
      topCoupons,
    };
  }

  async getAnalyticsForCoupon(id: number) {
    const coupon = await this.findOne(id);

    const usages = await this.couponUsageRepo.find({
      where: { couponId: id },
      order: { usedAt: 'DESC' },
      take: 50,
    });

    const totalDiscountGiven = await this.ordersRepo
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.couponAmount), 0)', 'sum')
      .where('order.couponId = :id', { id })
      .getRawOne();

    const topUsers = await this.couponUsageRepo
      .createQueryBuilder('usage')
      .select('usage.email', 'email')
      .addSelect('COUNT(*)', 'usageCount')
      .where('usage.couponId = :id', { id })
      .groupBy('usage.email')
      .orderBy('"usageCount"', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      coupon,
      usageCount: coupon.usageCount,
      totalDiscountGiven: Number(totalDiscountGiven?.sum || 0),
      recentUsages: usages,
      topUsers,
    };
  }

  searchProducts(q: string) {
    return this.productsRepo
      .find({ where: q ? { name: ILike(`%${q}%`) } : {}, take: 20 })
      .then((rows) => rows.map((r) => ({ id: r.id, name: r.name })));
  }

  searchCategories(q: string) {
    return this.categoriesRepo
      .find({ where: q ? { name: ILike(`%${q}%`) } : {}, take: 20 })
      .then((rows) => rows.map((r) => ({ id: r.id, name: r.name })));
  }

  async searchVariants(q: string) {
    const qb = this.variantsRepo
      .createQueryBuilder('variant')
      .leftJoinAndSelect('variant.product', 'product')
      .take(20);
    if (q) {
      qb.where('variant.label ILIKE :q OR variant.sku ILIKE :q OR product.name ILIKE :q', { q: `%${q}%` });
    }
    const rows = await qb.getMany();
    return rows.map((r) => ({ id: r.id, name: `${r.product?.name || ''} — ${r.label}` }));
  }
}
