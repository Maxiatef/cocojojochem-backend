import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountStatus, Company, Order, QuoteRequest } from '../../entities';

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

  async getStats() {
    const total = await this.companiesRepo.count();
    const pending = await this.companiesRepo.count({ where: { status: AccountStatus.PENDING } });
    return { total, pending };
  }

  async findById(id: number) {
    const company = await this.companiesRepo.findOne({ where: { id }, relations: ['users'] });
    if (!company) throw new NotFoundException(`Company #${id} not found`);
    return company;
  }

  async create(data: Partial<Company>) {
    const company = this.companiesRepo.create(data);
    const saved = await this.companiesRepo.save(company);
    this.logger.log(`Company created: "${saved.name}" (id=${saved.id}, status=${saved.status})`);
    return saved;
  }

  async setStatus(id: number, status: AccountStatus) {
    const company = await this.findById(id);
    const previousStatus = company.status;
    company.status = status;
    const saved = await this.companiesRepo.save(company);
    this.logger.log(`Company "${saved.name}" (id=${id}) status changed: ${previousStatus} -> ${status}`);
    return saved;
  }

  // Every order placed by any user belonging to this company — joined through User -> Order.
  async findOrders(companyId: number) {
    await this.findById(companyId);
    return this.ordersRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .innerJoin('order.user', 'user')
      .where('user.companyId = :companyId', { companyId })
      .orderBy('order.createdAt', 'DESC')
      .getMany();
  }

  findQuoteRequests(companyId: number) {
    return this.quoteRequestsRepo.find({
      where: { companyId },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
  }
}
