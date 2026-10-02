import { randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isUUID as isUuid } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuoteRequest, QuoteRequestItem, RequestStatus, RequestType } from '../../entities';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto';
import { SaveQuoteDto } from './dto/quote.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class QuoteRequestsService {
  private readonly logger = new Logger('QuoteRequests');

  constructor(
    @InjectRepository(QuoteRequest)
    private readonly quoteRequestsRepo: Repository<QuoteRequest>,
    @InjectRepository(QuoteRequestItem)
    private readonly itemsRepo: Repository<QuoteRequestItem>,
    private readonly emailService: EmailService,
  ) {}

  findAll(status?: RequestStatus, orderId?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    // Order detail asks "was pricing also requested with this order?"
    if (orderId && isUuid(orderId)) where.orderId = orderId;
    return this.quoteRequestsRepo.find({
      where,
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  findMine(userId: string) {
    return this.quoteRequestsRepo.find({
      where: { userId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const qr = await this.quoteRequestsRepo.findOne({ where: { id }, relations: ['items'] });
    if (!qr) throw new NotFoundException(`Quote request #${id} not found`);
    return qr;
  }

  async create(dto: CreateQuoteRequestDto, user: { id: string; role?: string } | null = null) {
    // Spam trap filled in: answer as if it worked, store and send nothing.
    if (dto.website) {
      this.logger.warn(`Quote request spam trap tripped (${dto.email}) — discarded.`);
      return { id: randomUUID(), status: RequestStatus.NEW, createdAt: new Date() };
    }

    // ORDER = ready to buy, so it needs somewhere to deliver. A request sent
    // alongside a payment is always an order request.
    const kind = dto.withPayment || dto.kind === 'ORDER' ? 'ORDER' : 'QUOTE';
    if (kind === 'ORDER' && !dto.destination?.trim()) {
      throw new BadRequestException('Add a delivery city, state and country to send an order request.');
    }

    const quoteRequest = this.quoteRequestsRepo.create({
      kind,
      // Only customer accounts are linked; a staff member trying the form
      // while signed in is not a customer's request.
      userId: user && (!user.role || user.role === 'CUSTOMER') ? user.id : null,
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      companyName: dto.companyName,
      message: dto.message,
      destination: dto.destination?.trim() || null,
      paymentRequested: !!dto.withPayment,
      type: dto.type || RequestType.QUOTE,
      items: dto.items?.map((i) => {
        const isReference = i.source === 'SUPPLIER_REFERENCE';
        return this.itemsRepo.create({
          productId: isReference ? null : i.productId ?? null,
          productName: i.productName,
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
          notes: i.notes ?? null,
          source: isReference ? 'SUPPLIER_REFERENCE' : 'COCOJOJO',
          referenceCode: isReference ? i.referenceCode ?? null : null,
          sourceUrl: isReference ? i.sourceUrl ?? null : null,
        });
      }),
    });
    const saved = await this.quoteRequestsRepo.save(quoteRequest);
    this.logger.log(
      `New ${saved.type} request from ${saved.fullName} <${saved.email}>${saved.companyName ? ` (${saved.companyName})` : ''} — id=${saved.id}`,
    );

    // Best-effort — a notification-email failure must never break the
    // customer's actual quote request submission.
    try {
      await this.emailService.sendQuoteRequestNotification(saved);
    } catch (err) {
      this.logger.warn(
        `Quote request notification threw unexpectedly for #${saved.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    await this.safely(() => this.emailService.sendRequestReceivedToCustomer(saved), 'request received');

    return saved;
  }

  /** Emails are best-effort: a failed send must never fail the action. */
  private async safely(send: () => Promise<void>, what: string) {
    try {
      await send();
    } catch (err) {
      this.logger.warn(`Email "${what}" threw: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Status changes that mean something to the customer are emailed to them:
  // NEW → IN_PROGRESS ("we're reviewing") and → LOST ("closed", with the
  // reason). QUOTED is reached through saveQuote, which sends the quote.
  async updateStatus(id: string, status: RequestStatus, reason?: string) {
    const qr = await this.findOne(id);
    const previousStatus = qr.status;
    if (previousStatus === status) return qr;
    qr.status = status;
    if (status === RequestStatus.LOST) {
      qr.closeReason = reason?.trim() || qr.closeReason;
      qr.acceptedAt = null;
    }
    const saved = await this.quoteRequestsRepo.save(qr);
    this.logger.log(`Quote request #${id} status changed: ${previousStatus} -> ${status}`);

    if (status === RequestStatus.IN_PROGRESS && previousStatus === RequestStatus.NEW) {
      await this.safely(() => this.emailService.sendRequestReviewingToCustomer(saved), 'request reviewing');
    }
    if (status === RequestStatus.LOST) {
      await this.safely(() => this.emailService.sendRequestClosedToCustomer(saved, false), 'request closed');
    }
    return saved;
  }

  // ---------------------------------------------------------------- quotes

  /**
   * Staff price the request line by line. `send` emails the quote to the
   * customer (with their private link) and marks the request QUOTED;
   * otherwise it is saved as a draft. Re-sending after changes is allowed
   * until the quote is paid — the customer's cart then shows the new prices.
   */
  async saveQuote(id: string, dto: SaveQuoteDto) {
    const qr = await this.findOne(id);
    if (qr.quoteOrderId) throw new BadRequestException('This quote is already paid and can no longer change.');

    const byId = new Map(qr.items.map((i) => [i.id, i]));
    for (const line of dto.items) {
      const item = byId.get(line.id);
      if (!item) throw new BadRequestException('One of the quoted lines does not belong to this request.');
      item.isAvailable = line.isAvailable;
      item.quotedPrice = line.isAvailable && line.quotedPrice != null ? line.quotedPrice.toFixed(2) : null;
      item.quotedPackSize = line.quotedPackSize?.trim() || null;
      item.quotedQuantity = line.quotedQuantity ?? null;
      item.availability = line.availability?.trim() || null;
      item.quoteNote = line.quoteNote?.trim() || null;
    }
    qr.quoteMessage = dto.quoteMessage?.trim() || null;
    qr.quotedShippingCost = dto.quotedShippingCost != null ? dto.quotedShippingCost.toFixed(2) : null;

    if (dto.send) {
      const priced = qr.items.some((i) => i.isAvailable && i.quotedPrice != null);
      if (!priced) {
        throw new BadRequestException('Price at least one available item before sending the quote.');
      }
      // Quoted items carry no weight for the checkout's shipping estimate, so
      // their shipping must be part of the quote — 0 when free or included.
      if (qr.quotedShippingCost == null) {
        throw new BadRequestException('Enter the shipping cost for this quote (0 if free or included in the price).');
      }
      qr.quoteToken = qr.quoteToken || randomBytes(24).toString('base64url');
      qr.status = RequestStatus.QUOTED;
      qr.quotedAt = new Date();
      qr.declinedAt = null;
    }

    await this.itemsRepo.save(qr.items);
    const saved = await this.quoteRequestsRepo.save(qr);
    if (dto.send) {
      this.logger.log(`Quote sent for request #${id}.`);
      await this.safely(() => this.emailService.sendQuoteReadyToCustomer(saved), 'quote ready');
    }
    return saved;
  }

  private async findByToken(token: string) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new NotFoundException('Quote not found.');
    const qr = await this.quoteRequestsRepo.findOne({ where: { quoteToken: token }, relations: ['items'] });
    if (!qr) throw new NotFoundException('Quote not found.');
    return qr;
  }

  /** What the customer's quote link shows — no internal fields. */
  publicQuote(qr: QuoteRequest) {
    const { subtotal, shipping } = this.emailService.quoteTotals(qr);
    return {
      token: qr.quoteToken,
      reference: `CJ-${qr.id.slice(0, 8).toUpperCase()}`,
      kind: qr.kind,
      status: qr.status,
      fullName: qr.fullName,
      destination: qr.destination,
      quoteMessage: qr.quoteMessage,
      quotedAt: qr.quotedAt,
      acceptedAt: qr.acceptedAt,
      declinedAt: qr.declinedAt,
      closeReason: qr.status === RequestStatus.LOST ? qr.closeReason : null,
      paid: !!qr.quoteOrderId,
      shippingCost: shipping,
      subtotal,
      items: qr.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.productName,
        source: i.source,
        referenceCode: i.referenceCode,
        requestedQuantity: i.quantity,
        requestedSize: i.unit,
        quantity: i.quotedQuantity ?? i.quantity ?? 1,
        packSize: i.quotedPackSize || i.unit,
        unitPrice: i.quotedPrice != null ? Number(i.quotedPrice) : null,
        availability: i.availability,
        note: i.quoteNote,
        isAvailable: i.isAvailable,
      })),
    };
  }

  async getQuoteByToken(token: string) {
    const qr = await this.findByToken(token);
    if (!qr.quotedAt) throw new NotFoundException('Quote not found.');
    return this.publicQuote(qr);
  }

  private assertOpen(qr: QuoteRequest) {
    if (qr.quoteOrderId) throw new BadRequestException('This quote has already been paid.');
    if (qr.status !== RequestStatus.QUOTED) throw new BadRequestException('This quote is no longer open.');
  }

  /** "Add quoted items to cart": the cart reads accepted, unpaid quotes. */
  async acceptQuote(token: string) {
    const qr = await this.findByToken(token);
    this.assertOpen(qr);
    const firstTime = !qr.acceptedAt;
    qr.acceptedAt = qr.acceptedAt || new Date();
    const saved = await this.quoteRequestsRepo.save(qr);
    if (firstTime) await this.safely(() => this.emailService.sendQuoteEventToStaff(saved, 'ACCEPTED'), 'quote accepted');
    return this.publicQuote(saved);
  }

  /** Removed from the cart: still open, just not accepted. */
  async unacceptQuote(token: string) {
    const qr = await this.findByToken(token);
    if (qr.quoteOrderId) return this.publicQuote(qr);
    qr.acceptedAt = null;
    return this.publicQuote(await this.quoteRequestsRepo.save(qr));
  }

  async declineQuote(token: string, reason?: string) {
    const qr = await this.findByToken(token);
    this.assertOpen(qr);
    qr.status = RequestStatus.LOST;
    qr.declinedAt = new Date();
    qr.acceptedAt = null;
    qr.closeReason = reason?.trim() || 'Declined by the customer.';
    const saved = await this.quoteRequestsRepo.save(qr);
    await this.safely(() => this.emailService.sendQuoteEventToStaff(saved, 'DECLINED'), 'quote declined (staff)');
    await this.safely(() => this.emailService.sendRequestClosedToCustomer(saved, true), 'quote declined (customer)');
    return this.publicQuote(saved);
  }

  // Pipeline dashboard: counts grouped by status and by type, plus a rolling
  // 30-day trend — what an admin dashboard's "quote pipeline" widget needs.
  async getStats() {
    const byStatus = await this.quoteRequestsRepo
      .createQueryBuilder('qr')
      .select('qr.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('qr.status')
      .getRawMany();

    const byType = await this.quoteRequestsRepo
      .createQueryBuilder('qr')
      .select('qr.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('qr.type')
      .getRawMany();

    const last30Days = await this.quoteRequestsRepo
      .createQueryBuilder('qr')
      .select("DATE_TRUNC('day', qr.createdAt)", 'day')
      .addSelect('COUNT(*)', 'count')
      .where("qr.createdAt >= NOW() - INTERVAL '30 days'")
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany();

    const total = await this.quoteRequestsRepo.count();

    return { total, byStatus, byType, last30Days };
  }
}
