import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Function as ProductFunction, Product } from '../../entities';

@Injectable()
export class FunctionsService {
  constructor(
    @InjectRepository(ProductFunction)
    private readonly functionsRepo: Repository<ProductFunction>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  // "Shop by Chemical Function" list, each with a live product count.
  findAll() {
    return this.functionsRepo
      .createQueryBuilder('function')
      .loadRelationCountAndMap('function.productCount', 'function.products', 'product', (qb) =>
        qb.andWhere('product.isActive = true'),
      )
      .orderBy('function.name', 'ASC')
      .getMany();
  }

  async findBySlug(slug: string) {
    const fn = await this.functionsRepo.findOne({ where: { slug } });
    if (!fn) throw new NotFoundException(`Function "${slug}" not found`);
    return fn;
  }

  // Products tagged with this function, joined with category/variants — the
  // "Products with this function" panel seen on individual product pages.
  async findProducts(slug: string, page = 1, limit = 20) {
    const fn = await this.findBySlug(slug);

    const [data, total] = await this.productsRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variants')
      .innerJoin('product.functions', 'fn', 'fn.id = :fnId', { fnId: fn.id })
      .where('product.isActive = true')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { function: fn, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  create(name: string, slug: string, description?: string) {
    const fn = this.functionsRepo.create({ name, slug, description });
    return this.functionsRepo.save(fn);
  }

  async update(id: number, data: { name?: string; slug?: string; description?: string }) {
    const fn = await this.functionsRepo.preload({ id, ...data });
    if (!fn) throw new NotFoundException(`Function #${id} not found`);
    return this.functionsRepo.save(fn);
  }

  async remove(id: number) {
    const fn = await this.functionsRepo.findOne({ where: { id } });
    if (!fn) throw new NotFoundException(`Function #${id} not found`);
    return this.functionsRepo.remove(fn);
  }
}
