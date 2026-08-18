import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductVariant } from '../../entities';
import { withPricing } from '../../common/pricing.util';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger('Products');

  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
  ) {}

  private baseQuery() {
    return this.productsRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('product.functions', 'functions')
      .leftJoinAndSelect('product.certifications', 'certifications');
  }

  // Decorates every variant with isOnSale/effectivePrice, matching the shape
  // the real cocojojo.com wholesale API returns.
  private decorate<T extends Product>(product: T) {
    return { ...product, variants: (product.variants || []).map(withPricing) };
  }

  private decorateAll<T extends Product>(products: T[]) {
    return products.map((p) => this.decorate(p));
  }

  async findAll(query: QueryProductsDto) {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.baseQuery().where('product.isActive = true');

    if (query.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId: query.categoryId });
    }
    if (query.functionSlug) {
      qb.andWhere('functions.slug = :functionSlug', { functionSlug: query.functionSlug });
    }
    if (query.certificationId) {
      qb.andWhere('certifications.id = :certificationId', {
        certificationId: query.certificationId,
      });
    }
    if (query.search) {
      qb.andWhere(
        '(product.name ILIKE :search OR product.inciName ILIKE :search OR product.sku ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.minPrice != null) {
      qb.andWhere('variants.price >= :minPrice', { minPrice: query.minPrice });
    }
    if (query.maxPrice != null) {
      qb.andWhere('variants.price <= :maxPrice', { maxPrice: query.maxPrice });
    }
    if (query.inStockOnly === 'true') {
      qb.andWhere('variants.stockStatus = :inStock', { inStock: 'IN_STOCK' });
    }

    switch (query.sort) {
      case 'name_desc':
        qb.orderBy('product.name', 'DESC');
        break;
      case 'price_asc':
        qb.orderBy('variants.price', 'ASC');
        break;
      case 'price_desc':
        qb.orderBy('variants.price', 'DESC');
        break;
      case 'newest':
        qb.orderBy('product.createdAt', 'DESC');
        break;
      default:
        qb.orderBy('product.name', 'ASC');
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data: this.decorateAll(data),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  // Admin lookup by numeric id (the public API only resolves by slug) — used
  // by the admin edit form, which has the id from the list but not the slug's
  // canonical form needed to round-trip safely if the slug itself is edited.
  async findById(id: number) {
    const product = await this.productsRepo.findOne({
      where: { id },
      relations: ['category', 'variants', 'functions', 'certifications'],
    });
    if (!product) throw new NotFoundException(`Product #${id} not found`);
    return this.decorate(product);
  }

  // Admin listing: unlike findAll(), this does NOT filter to isActive-only —
  // the admin dashboard needs to see and manage inactive/unpublished products too.
  async findAllAdmin(page = 1, limit = 20, search?: string) {
    const qb = this.baseQuery();

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR product.inciName ILIKE :search OR product.sku ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('product.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data: this.decorateAll(data),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findBySlug(slug: string) {
    const product = await this.productsRepo.findOne({
      where: { slug },
      relations: [
        'category',
        'variants',
        'functions',
        'certifications',
        'gallery',
        'documents',
        'specs',
      ],
    });
    if (!product) throw new NotFoundException(`Product "${slug}" not found`);
    return this.decorate(product);
  }

  async findFeatured(limit = 12) {
    const products = await this.baseQuery()
      .where('product.isActive = true')
      .andWhere('product.isFeatured = true')
      .take(limit)
      .getMany();
    return this.decorateAll(products);
  }

  // Related products: same category first, then products sharing at least one
  // function tag — useful for the "you may also need" panel on a product page.
  async findRelated(slug: string, limit = 8) {
    const product = await this.productsRepo.findOne({
      where: { slug },
      relations: ['functions'],
    });
    if (!product) throw new NotFoundException(`Product "${slug}" not found`);

    const functionIds = product.functions.map((f) => f.id);

    const qb = this.baseQuery()
      .where('product.isActive = true')
      .andWhere('product.id != :id', { id: product.id })
      .andWhere(
        functionIds.length
          ? '(product.categoryId = :categoryId OR functions.id IN (:...functionIds))'
          : 'product.categoryId = :categoryId',
        { categoryId: product.categoryId, functionIds },
      )
      .take(limit);

    return this.decorateAll(await qb.getMany());
  }

  // Ranked full-text + trigram search, ported from the real cocojojo.com wholesale
  // search: combines ts_rank on the generated search_vector, pg_trgm similarity
  // across the same fields, and an exact/prefix/contains match bonus ladder so
  // a literal SKU or name hit always outranks a fuzzy one.
  async search(query: string, categoryId?: number, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const params: any[] = [query, query];
    let categoryFilter = '';
    if (categoryId) {
      params.push(categoryId);
      categoryFilter = `AND p."categoryId" = $${params.length}`;
    }
    params.push(limit, offset);

    const rows = await this.productsRepo.query(
      `
      SELECT p.*,
        c."name" AS "categoryName", c."slug" AS "categorySlug",
        (
          ts_rank(p.search_vector, plainto_tsquery('english', $1)) * 10
          + GREATEST(
              similarity(p.name, $2),
              similarity(p.sku, $2),
              similarity(coalesce(p."inciName", ''), $2),
              similarity(coalesce(p."casNumber", ''), $2),
              similarity(coalesce(p."botanicalName", ''), $2)
            ) * 5
          + CASE
              WHEN lower(p.name) = lower($2) OR lower(p.sku) = lower($2) THEN 140
              WHEN lower(p.name) LIKE lower($2) || '%' OR lower(p.sku) LIKE lower($2) || '%' THEN 60
              WHEN lower(p.name) LIKE '%' || lower($2) || '%' THEN 30
              ELSE 0
            END
        ) AS "relevance"
      FROM "products" p
      LEFT JOIN "categories" c ON c.id = p."categoryId"
      WHERE (
        p.search_vector @@ plainto_tsquery('english', $1)
        OR similarity(p.name, $2) > 0.15
        OR similarity(p.sku, $2) > 0.15
        OR similarity(coalesce(p."inciName", ''), $2) > 0.15
        OR similarity(coalesce(p."casNumber", ''), $2) > 0.15
      )
      ${categoryFilter}
      ORDER BY "relevance" DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params,
    );

    return { data: rows, pagination: { page, limit } };
  }

  // A-Z index: products grouped by first letter, matching cocojojo.com's alphabetical browse.
  async findAZIndex() {
    const products = await this.productsRepo
      .createQueryBuilder('product')
      .select(['product.id', 'product.name', 'product.slug'])
      .where('product.isActive = true')
      .orderBy('product.name', 'ASC')
      .getMany();

    const grouped: Record<string, { id: number; name: string; slug: string }[]> = {};
    for (const p of products) {
      const letter = p.name.charAt(0).toUpperCase();
      const key = /[A-Z]/.test(letter) ? letter : '#';
      (grouped[key] ??= []).push({ id: p.id, name: p.name, slug: p.slug });
    }
    return grouped;
  }

  async create(dto: CreateProductDto) {
    const { variants, functionIds, certificationIds, ...productData } = dto;
    const product = this.productsRepo.create({
      ...productData,
      functions: functionIds?.map((id) => ({ id })) as any,
      certifications: certificationIds?.map((id) => ({ id })) as any,
      variants: variants.map((v) =>
        this.variantsRepo.create({
          ...v,
          price: String(v.price),
          salePrice: v.salePrice != null ? String(v.salePrice) : null,
        }),
      ),
    });
    const saved = await this.productsRepo.save(product);
    this.logger.log(`Product created: "${saved.name}" (id=${saved.id}, sku=${saved.sku})`);
    return saved;
  }

  async update(id: number, dto: UpdateProductDto) {
    const { variants, functionIds, certificationIds, ...productData } = dto;
    const product = await this.productsRepo.preload({
      id,
      ...productData,
      ...(functionIds ? { functions: functionIds.map((fid) => ({ id: fid })) as any } : {}),
      ...(certificationIds
        ? { certifications: certificationIds.map((cid) => ({ id: cid })) as any }
        : {}),
    });
    if (!product) throw new NotFoundException(`Product #${id} not found`);
    const saved = await this.productsRepo.save(product);

    // Variants are replaced wholesale (delete-then-recreate) rather than diffed —
    // simple and correct since a product's variant list is small and edited as a whole.
    if (variants) {
      await this.variantsRepo.delete({ productId: id });
      const newVariants = variants.map((v) =>
        this.variantsRepo.create({
          ...v,
          productId: id,
          price: String(v.price),
          salePrice: v.salePrice != null ? String(v.salePrice) : null,
        }),
      );
      await this.variantsRepo.save(newVariants);
    }

    this.logger.log(`Product updated: "${saved.name}" (id=${saved.id})`);
    return this.findById(id);
  }

  async remove(id: number) {
    const product = await this.productsRepo.findOne({ where: { id } });
    if (!product) throw new NotFoundException(`Product #${id} not found`);
    this.logger.log(`Product deleted: "${product.name}" (id=${product.id})`);
    return this.productsRepo.remove(product);
  }
}
