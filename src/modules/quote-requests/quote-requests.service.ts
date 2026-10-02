import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isUUID as isUuid } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuoteRequest, QuoteRequestItem, RequestStatus, RequestType } from '../../entities';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto';
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

    const quoteRequest = this.quoteRequestsRepo.create({
      // Only customer accounts are linked; a staff member trying the form
      // while signed in is not a customer's request.
      userId: user && (!user.role || user.role === 'CUSTOMER') ? user.id : null,
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      companyName: dto.companyName,
      message: dto.message,
      destination: dto.destination ?? null,
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

    return saved;
  }

  async updateStatus(id: string, status: RequestStatus) {
    const qr = await this.findOne(id);
    const previousStatus = qr.status;
    qr.status = status;
    const saved = await this.quoteRequestsRepo.save(qr);
    this.logger.log(`Quote request #${id} status changed: ${previousStatus} -> ${status}`);
    return saved;
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
