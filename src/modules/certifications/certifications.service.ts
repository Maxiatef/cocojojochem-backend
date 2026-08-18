import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Certification, Product } from '../../entities';

@Injectable()
export class CertificationsService {
  constructor(
    @InjectRepository(Certification)
    private readonly certificationsRepo: Repository<Certification>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  findAll() {
    return this.certificationsRepo
      .createQueryBuilder('certification')
      .loadRelationCountAndMap(
        'certification.productCount',
        'certification.products',
        'product',
        (qb) => qb.andWhere('product.isActive = true'),
      )
      .orderBy('certification.name', 'ASC')
      .getMany();
  }

  async findOne(id: number) {
    const cert = await this.certificationsRepo.findOne({ where: { id } });
    if (!cert) throw new NotFoundException(`Certification #${id} not found`);
    return cert;
  }

  // Products certified by e.g. USDA Organic / Non-GMO / Cruelty-Free
  async findProducts(id: number, page = 1, limit = 20) {
    const cert = await this.findOne(id);

    const [data, total] = await this.productsRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variants')
      .innerJoin('product.certifications', 'cert', 'cert.id = :certId', { certId: cert.id })
      .where('product.isActive = true')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { certification: cert, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  create(name: string, iconUrl?: string) {
    const cert = this.certificationsRepo.create({ name, iconUrl });
    return this.certificationsRepo.save(cert);
  }
}
