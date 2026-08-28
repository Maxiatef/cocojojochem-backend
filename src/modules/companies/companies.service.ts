import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company, Order, QuoteRequest } from '../../entities';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger('Companies');

  constructor(
    @InjectRepository(Company)
    private readonly companiesRepo: Repository<Company>,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(QuoteRequest)
    private readonly quoteRequestsRepo: Repository<QuoteRequest>,
  ) {}

  // Companies joined with their pending/won quote counts — an account-management list view.
  findAll() {
    return this.companiesRepo
      .createQueryBuilder('company')
      .loadRelationCountAndMap('company.userCount', 'company.users')
      .loadRelationCountAndMap('company.quoteRequestCount', 'company.quoteRequests')
      .orderBy('company.createdAt', 'DESC')
      .getMany();
  }

  async findById(id: number) {
    const company = await this.companiesRepo.findOne({ where: { id }, relations: ['users'] });
    if (!company) throw new NotFoundException(`Company #${id} not found`);
    // Strip passwordHash before this ever reaches a client — findOne's
    // `users` relation loads full User rows, hash included.
    company.users = (company.users || []).map((u) => {
      const { passwordHash, ...safeUser } = u;
      return safeUser as typeof u;
    });
    return company;
  }

  async create(data: Partial<Company>) {
    const company = this.companiesRepo.create(data);
    const saved = await this.companiesRepo.save(company);
    this.logger.log(`Company created: "${saved.name}" (id=${saved.id}, status=${saved.status})`);
    return saved;
  }

  async update(id: number, data: Partial<Company>) {
    const company = await this.companiesRepo.findOne({ where: { id } });
    if (!company) throw new NotFoundException(`Company #${id} not found`);
    Object.assign(company, data);
    const saved = await this.companiesRepo.save(company);
    this.logger.log(`Company updated: "${saved.name}" (id=${saved.id})`);
    return saved;
  }

  // Every order placed by any user belonging to this company — joined through User -> Order.
  async findOrders(companyId: number) {
    await this.findById(companyId);
    const orders = await this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .innerJoinAndSelect('order.user', 'user')
      .where('user.companyId = :companyId', { companyId })
      .orderBy('order.createdAt', 'DESC')
      .getMany();
    // Strip passwordHash before this reaches a client — same leak risk as
    // findById's users relation.
    for (const order of orders) {
      if (order.user) {
        const { passwordHash, ...safeUser } = order.user;
        order.user = safeUser as typeof order.user;
      }
    }
    return orders;
  }

  async findQuoteRequests(companyId: number) {
    // Left join, not inner — a quote request can be tied to this company by
    // companyId alone (e.g. companyName typed on a guest submission) with no
    // linked userId, and those must still show up in the list.
    const quoteRequests = await this.quoteRequestsRepo
      .createQueryBuilder('qr')
      .leftJoinAndSelect('qr.items', 'items')
      .leftJoinAndSelect('qr.user', 'user')
      .where('qr.companyId = :companyId', { companyId })
      .orderBy('qr.createdAt', 'DESC')
      .getMany();
    // Strip passwordHash before this reaches a client — same leak risk as
    // findById's users relation.
    for (const qr of quoteRequests) {
      if (qr.user) {
        const { passwordHash, ...safeUser } = qr.user;
        qr.user = safeUser as typeof qr.user;
      }
    }
    return quoteRequests;
  }
}
