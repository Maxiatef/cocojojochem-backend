import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Cart, Order, OrderItem, OrderStatus, ProductVariant } from '../../entities';
import { getEffectivePrice } from '../../common/pricing.util';
import { UsersService } from '../users/users.service';
import { CouponsService } from '../coupons/coupons.service';
import { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemsRepo: Repository<OrderItem>,
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
    private readonly usersService: UsersService,
    private readonly couponsService: CouponsService,
    private readonly jwtService: JwtService,
  ) {}

  // Re-validates a coupon server-side and applies its discount — never trusts
  // a client-sent discount amount. Returns null if no code was provided or it
  // failed validation (checkout still proceeds, just without a discount).
  private async applyCoupon(
    couponCode: string | undefined,
    email: string | undefined,
    subtotal: number,
    cartItems: { productId?: number; variantId?: number; categoryId?: number; quantity: number; price: number }[],
  ) {
    if (!couponCode) return null;
    const result = await this.couponsService.validateCoupon({
      code: couponCode,
      orderAmount: subtotal,
      email,
      cartItems,
    });
    if (!result.isValid || !result.coupon) {
      this.logger.warn(`Coupon "${couponCode}" rejected at checkout: ${result.message}`);
      return null;
    }
    return { couponId: result.coupon.id, couponAmount: result.discountAmount || 0 };
  }

  findAllForUser(userId: number) {
    return this.ordersRepo.find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: number, id: number) {
    const order = await this.ordersRepo.findOne({ where: { id, userId }, relations: ['items'] });
    if (!order) throw new NotFoundException(`Order #${id} not found`);
    return order;
  }

  async checkout(userId: number | null, dto: CheckoutDto) {
    const { shippingAddress, notes } = dto;

    let order: Order;

    if (userId) {
      // Logged-in checkout: unchanged behavior — pulls from the server-side DB cart.
      const cart = await this.cartRepo.findOne({
        where: { userId },
        relations: ['items', 'items.variant', 'items.variant.product'],
      });
      if (!cart || cart.items.length === 0) throw new BadRequestException('Cart is empty');

      const orderItems = cart.items.map((item) =>
        this.orderItemsRepo.create({
          productVariantId: item.productVariantId,
          productName: item.variant.product?.name || '',
          variantLabel: item.variant.label,
          sku: item.variant.sku,
          quantity: item.quantity,
          price: item.price,
          purchaseType: item.purchaseType,
        }),
      );

      const subtotal = orderItems.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0,
      );

      const user = await this.usersService.findById(userId);
      const cartItemsForCoupon = cart.items.map((item) => ({
        productId: item.variant.product?.id,
        variantId: item.productVariantId,
        categoryId: item.variant.product?.categoryId,
        quantity: item.quantity,
        price: Number(item.price),
      }));
      const couponResult = await this.applyCoupon(dto.couponCode, user.email, subtotal, cartItemsForCoupon);
      const total = subtotal - (couponResult?.couponAmount || 0);

      order = this.ordersRepo.create({
        userId,
        status: OrderStatus.PENDING,
        items: orderItems,
        subtotal: subtotal.toFixed(2),
        total: total.toFixed(2),
        couponId: couponResult?.couponId ?? null,
        couponAmount: (couponResult?.couponAmount || 0).toFixed(2),
        shippingAddress,
        notes,
      });

      order = await this.ordersRepo.save(order);
      await this.cartRepo.manager.remove(cart.items);
      if (couponResult) {
        await this.couponsService.incrementUsage(couponResult.couponId, user.email, order.id);
      }
      this.logger.log(
        `Order placed: #${order.id} by user ${userId} — ${orderItems.length} item(s), total $${order.total}`,
      );
      return order;
    }

    // Guest checkout: no DB cart exists — items come straight from the request body.
    if (!dto.guestEmail || !dto.guestName) {
      throw new BadRequestException('Email and name are required to check out as a guest.');
    }
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Your cart is empty.');
    }

    const variantIds = dto.items.map((i) => i.productVariantId);
    const variants = await this.variantsRepo.find({
      where: { id: In(variantIds) },
      relations: ['product'],
    });
    const variantsById = new Map(variants.map((v) => [v.id, v]));

    const orderItems = dto.items.map((reqItem) => {
      const variant = variantsById.get(reqItem.productVariantId);
      if (!variant) {
        throw new BadRequestException(`Product variant #${reqItem.productVariantId} not found`);
      }
      return this.orderItemsRepo.create({
        productVariantId: variant.id,
        productName: variant.product?.name || '',
        variantLabel: variant.label,
        sku: variant.sku,
        quantity: reqItem.quantity,
        price: getEffectivePrice(variant),
      });
    });

    const subtotal = orderItems.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0,
    );

    const cartItemsForCoupon = dto.items.map((reqItem) => {
      const variant = variantsById.get(reqItem.productVariantId);
      return {
        productId: variant?.product?.id,
        variantId: reqItem.productVariantId,
        categoryId: variant?.product?.categoryId,
        quantity: reqItem.quantity,
        price: Number(getEffectivePrice(variant as ProductVariant)),
      };
    });
    const couponResult = await this.applyCoupon(dto.couponCode, dto.guestEmail, subtotal, cartItemsForCoupon);
    const total = subtotal - (couponResult?.couponAmount || 0);

    order = this.ordersRepo.create({
      userId: null,
      guestEmail: dto.guestEmail,
      guestName: dto.guestName,
      guestPhone: dto.guestPhone ?? null,
      status: OrderStatus.PENDING,
      items: orderItems,
      subtotal: subtotal.toFixed(2),
      total: total.toFixed(2),
      couponId: couponResult?.couponId ?? null,
      couponAmount: (couponResult?.couponAmount || 0).toFixed(2),
      shippingAddress,
      notes,
    });

    order = await this.ordersRepo.save(order);
    if (couponResult) {
      await this.couponsService.incrementUsage(couponResult.couponId, dto.guestEmail, order.id);
    }
    this.logger.log(
      `Guest order placed: #${order.id} by ${dto.guestEmail} — ${orderItems.length} item(s), total $${order.total}`,
    );

    let accessToken: string | undefined;

    if (dto.createAccount) {
      if (!dto.password) {
        this.logger.warn(
          `Skipped account creation for guest order #${order.id} — createAccount was true but no password was provided.`,
        );
      } else {
        const existing = await this.usersService.findByEmail(dto.guestEmail);
        if (existing) {
          this.logger.log(
            `Skipped account creation for guest order #${order.id} — email ${dto.guestEmail} is already registered.`,
          );
        } else {
          const passwordHash = await bcrypt.hash(dto.password, 10);
          const newUser = await this.usersService.create({
            email: dto.guestEmail,
            passwordHash,
            fullName: dto.guestName,
            phone: dto.guestPhone,
          });

          await this.ordersRepo.update(order.id, { userId: newUser.id });
          order.userId = newUser.id;

          accessToken = this.jwtService.sign({
            sub: newUser.id,
            email: newUser.email,
            role: newUser.role,
          });

          this.logger.log(
            `Account created from guest checkout: ${newUser.email} (id=${newUser.id}) — linked to order #${order.id}`,
          );
        }
      }
    }

    return accessToken ? { ...order, accessToken } : order;
  }

  // Admin/sales view: every order, joined to the placing user and their company,
  // with optional status filter — for an orders-management dashboard.
  async findAllAdmin(status?: OrderStatus, page = 1, limit = 20) {
    const qb = this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('user.company', 'company')
      .orderBy('order.createdAt', 'DESC');

    if (status) qb.andWhere('order.status = :status', { status });

    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async updateStatus(id: number, status: OrderStatus) {
    const order = await this.ordersRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order #${id} not found`);
    const previousStatus = order.status;
    order.status = status;
    const saved = await this.ordersRepo.save(order);
    this.logger.log(`Order #${id} status changed: ${previousStatus} -> ${status}`);
    return saved;
  }
}
