import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BulkSaleDiscount, ProductVariant } from '../../entities';
import { CreateBulkSaleDto } from './dto/create-bulk-sale.dto';
import { UpdateBulkSaleDto } from './dto/update-bulk-sale.dto';

function parseIds(value: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

@Injectable()
export class BulkSalesService {
  private readonly logger = new Logger('BulkSales');

  constructor(
    @InjectRepository(BulkSaleDiscount)
    private readonly bulkSalesRepo: Repository<BulkSaleDiscount>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
  ) {}

  findAll() {
    return this.bulkSalesRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: number) {
    const record = await this.bulkSalesRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException(`Bulk sale discount #${id} not found`);
    return record;
  }

  // Resolves the full set of target variants: direct variantIds, plus every
  // variant belonging to productIds, plus every variant of every product in categoryIds.
  private async resolveTargetVariants(
    categoryIds: number[],
    productIds: number[],
    variantIds: number[],
  ): Promise<ProductVariant[]> {
    const variantMap = new Map<number, ProductVariant>();

    if (variantIds.length) {
      const direct = await this.variantsRepo.find({ where: { id: In(variantIds) } });
      direct.forEach((v) => variantMap.set(v.id, v));
    }

    if (productIds.length) {
      const byProduct = await this.variantsRepo.find({ where: { productId: In(productIds) } });
      byProduct.forEach((v) => variantMap.set(v.id, v));
    }

    if (categoryIds.length) {
      const byCategory = await this.variantsRepo
        .createQueryBuilder('variant')
        .innerJoin('variant.product', 'product')
        .where('product.categoryId IN (:...categoryIds)', { categoryIds })
        .getMany();
      byCategory.forEach((v) => variantMap.set(v.id, v));
    }

    return Array.from(variantMap.values());
  }

  private async applySalesToProducts(record: BulkSaleDiscount) {
    const categoryIds = parseIds(record.categoryIds);
    const productIds = parseIds(record.productIds);
    const variantIds = parseIds(record.variantIds);

    const targets = await this.resolveTargetVariants(categoryIds, productIds, variantIds);
    if (!targets.length) return;

    const discountPercent = Number(record.discountPercent);
    for (const variant of targets) {
      const originalPrice = Number(variant.price);
      const salePrice = originalPrice - originalPrice * (discountPercent / 100);
      variant.salePrice = salePrice.toFixed(2);
      variant.saleStart = record.startDate;
      variant.saleEnd = record.endDate;
    }
    await this.variantsRepo.save(targets);
    this.logger.log(`Bulk sale "${record.name}" (id=${record.id}) applied to ${targets.length} variant(s)`);
  }

  private async removeSalesFromTargets(
    categoryIds: number[],
    productIds: number[],
    variantIds: number[],
  ) {
    const targets = await this.resolveTargetVariants(categoryIds, productIds, variantIds);
    if (!targets.length) return;
    for (const variant of targets) {
      variant.salePrice = null;
      variant.saleStart = null;
      variant.saleEnd = null;
    }
    await this.variantsRepo.save(targets);
    this.logger.log(`Removed sale pricing from ${targets.length} variant(s)`);
  }

  async create(dto: CreateBulkSaleDto) {
    const record = this.bulkSalesRepo.create({
      ...dto,
      discountPercent: String(dto.discountPercent),
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      categoryIds: dto.categoryIds ? JSON.stringify(dto.categoryIds) : null,
      productIds: dto.productIds ? JSON.stringify(dto.productIds) : null,
      variantIds: dto.variantIds ? JSON.stringify(dto.variantIds) : null,
    });
    const saved = await this.bulkSalesRepo.save(record);
    await this.applySalesToProducts(saved);
    this.logger.log(`Bulk sale discount created: "${saved.name}" (id=${saved.id})`);
    return saved;
  }

  async update(id: number, dto: UpdateBulkSaleDto) {
    const record = await this.findOne(id);

    // Remove sale pricing from the OLD target set before re-resolving.
    await this.removeSalesFromTargets(
      parseIds(record.categoryIds),
      parseIds(record.productIds),
      parseIds(record.variantIds),
    );

    const patch: any = { ...dto };
    if (dto.discountPercent != null) patch.discountPercent = String(dto.discountPercent);
    if (dto.startDate) patch.startDate = new Date(dto.startDate);
    if (dto.endDate) patch.endDate = new Date(dto.endDate);
    if (dto.categoryIds !== undefined) patch.categoryIds = dto.categoryIds ? JSON.stringify(dto.categoryIds) : null;
    if (dto.productIds !== undefined) patch.productIds = dto.productIds ? JSON.stringify(dto.productIds) : null;
    if (dto.variantIds !== undefined) patch.variantIds = dto.variantIds ? JSON.stringify(dto.variantIds) : null;

    Object.assign(record, patch);
    const saved = await this.bulkSalesRepo.save(record);

    if (saved.isActive) {
      await this.applySalesToProducts(saved);
    }
    this.logger.log(`Bulk sale discount updated: "${saved.name}" (id=${saved.id})`);
    return saved;
  }

  async remove(id: number) {
    const record = await this.findOne(id);
    await this.removeSalesFromTargets(
      parseIds(record.categoryIds),
      parseIds(record.productIds),
      parseIds(record.variantIds),
    );
    await this.bulkSalesRepo.remove(record);
    this.logger.log(`Bulk sale discount deleted: "${record.name}" (id=${id})`);
    return { success: true };
  }
}
