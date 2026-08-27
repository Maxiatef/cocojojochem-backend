import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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

  findAll(status?: RequestStatus) {
    return this.quoteRequestsRepo.find({
      where: status ? { status } : {},
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number) {
    const qr = await this.quoteRequestsRepo.findOne({ where: { id }, relations: ['items'] });
    if (!qr) throw new NotFoundException(`Quote request #${id} not found`);
    return qr;
  }

  async create(dto: CreateQuoteRequestDto) {
    const quoteRequest = this.quoteRequestsRepo.create({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      companyName: dto.companyName,
      message: dto.message,
      type: dto.type || RequestType.QUOTE,
      items: dto.items?.map((i) => this.itemsRepo.create(i)),
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

  async updateStatus(id: number, status: RequestStatus) {
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
