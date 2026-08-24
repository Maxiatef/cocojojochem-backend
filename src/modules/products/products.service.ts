import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  Product,
  ProductImage,
  ProductVariant,
  ProductSpec,
  ProductSeo,
  StockStatus,
  ProductVisibility,
} from '../../entities';
import { withPricing } from '../../common/pricing.util';
import { CreateProductDto, CreateVariantDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto';

// Quantity is the source of truth for IN_STOCK/OUT_OF_STOCK — an admin
// shouldn't have to separately remember to flip a status dropdown after
// zeroing out the quantity field. ON_BACKORDER is the one exception: it's a
// deliberate merchandising choice (still sellable while restocking), so an
// explicit stockStatus: 'ON_BACKORDER' always wins regardless of quantity.
// Matches the dashboard overview's low-stock threshold (see dashboard.service.ts).
const LOW_STOCK_THRESHOLD = 10;

// Scheduling forces the real status, matching WordPress's "future post"
// behavior: a product with a future scheduledPublishAt is ALWAYS treated as
// Draft regardless of whatever the admin's Published/Draft toggle says, and
// a scheduledPublishAt that's already in the past (or now) publishes
// immediately and clears the schedule. Returns `{}` (no override) when
// scheduledPublishAt wasn't part of this request at all.
function resolveScheduleFields(
  rawScheduledPublishAt: string | undefined,
): Partial<Pick<Product, 'isPublished' | 'scheduledPublishAt'>> {
  if (rawScheduledPublishAt === undefined) return {};
  if (!rawScheduledPublishAt) return { scheduledPublishAt: null };
  const date = new Date(rawScheduledPublishAt);
  if (date > new Date()) {
    return { isPublished: false, scheduledPublishAt: date };
  }
  return { isPublished: true, scheduledPublishAt: null };
}

function resolveStockStatus(v: CreateVariantDto): StockStatus {
  if (v.stockStatus === StockStatus.ON_BACKORDER) return StockStatus.ON_BACKORDER;
  if (v.stockQuantity != null) {
    return v.stockQuantity <= 0 ? StockStatus.OUT_OF_STOCK : StockStatus.IN_STOCK;
  }
  return v.stockStatus ?? StockStatus.IN_STOCK;
}

@Injectable()
export class ProductsService {
  private readonly logger = new Logger('Products');

  constructor(
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantsRepo: Repository<ProductVariant>,
    @InjectRepository(ProductImage)
    private readonly galleryRepo: Repository<ProductImage>,
    @InjectRepository(ProductSpec)
    private readonly specsRepo: Repository<ProductSpec>,
    @InjectRepository(ProductSeo)
    private readonly seoRepo: Repository<ProductSeo>,
  ) {}

  private baseQuery() {
    return this.productsRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('product.functions', 'functions')
      .leftJoinAndSelect('product.certifications', 'certifications')
      .leftJoinAndSelect('product.gallery', 'gallery')
      .leftJoinAndSelect('product.specs', 'specs')
      .leftJoinAndSelect('product.seo', 'seo');
  }

  // Lazily flips any product whose scheduled publish time has arrived from
  // Draft to Published — no cron job needed, this just runs at the top of
  // every read path so the transition happens the moment anyone (admin or
  // storefront) next looks, which is effectively instant in practice.
  private async autoPublishDueSchedules(): Promise<void> {
    await this.productsRepo.query(
      `UPDATE products SET "isPublished" = true, "scheduledPublishAt" = NULL
       WHERE "scheduledPublishAt" IS NOT NULL AND "scheduledPublishAt" <= NOW()`,
    );
  }

  // Public visibility gate — applied on top of baseQuery() for every
  // public-facing (non-admin) query. A product must be published, not
  // scheduled for the future, and PUBLIC visibility. PASSWORD_PROTECTED
  // products are excluded here entirely (they only surface via findBySlug
  // with the matching password); PRIVATE products never surface publicly.
  private applyPublicVisibility(qb: SelectQueryBuilder<Product>) {
    return qb
      .andWhere('product.isPublished = true')
      .andWhere('(product.scheduledPublishAt IS NULL OR product.scheduledPublishAt <= NOW())')
      .andWhere('product.visibility = :publicVisibility', {
        publicVisibility: ProductVisibility.PUBLIC,
      });
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
    await this.autoPublishDueSchedules();
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.applyPublicVisibility(this.baseQuery());

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
    await this.autoPublishDueSchedules();
    const product = await this.productsRepo.findOne({
      where: { id },
      relations: ['category', 'variants', 'functions', 'certifications', 'gallery', 'specs', 'seo'],
    });
    if (!product) throw new NotFoundException(`Product #${id} not found`);
    return this.decorate(product);
  }

  // Admin listing: unlike findAll(), this does NOT filter to isActive-only by default —
  // the admin dashboard needs to see and manage inactive/unpublished products too.
  async findAllAdmin(
    page = 1,
    limit = 20,
    search?: string,
    categoryId?: number,
    functionSlug?: string,
    isPublished?: string,
    sort?: ProductSort,
    stockStatus?: string,
    lowStock?: string,
  ) {
    await this.autoPublishDueSchedules();
    const qb = this.baseQuery();

    if (search) {
      qb.andWhere(
        '(product.name ILIKE :search OR product.inciName ILIKE :search OR product.sku ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (categoryId) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId });
    }
    if (functionSlug) {
      qb.andWhere('functions.slug = :functionSlug', { functionSlug });
    }
    if (isPublished === 'true') {
      qb.andWhere('product.isPublished = true');
    } else if (isPublished === 'false') {
      qb.andWhere('product.isPublished = false');
    }
    if (stockStatus) {
      qb.andWhere('variants.stockStatus = :stockStatus', { stockStatus });
    }
    if (lowStock === 'true') {
      qb.andWhere('variants.stockStatus = :inStockStatus', { inStockStatus: StockStatus.IN_STOCK })
        .andWhere('variants.stockQuantity IS NOT NULL')
        .andWhere('variants.stockQuantity > 0')
        .andWhere('variants.stockQuantity <= COALESCE(variants.lowStockThreshold, :defaultThreshold)', {
          defaultThreshold: LOW_STOCK_THRESHOLD,
        });
    }

    switch (sort) {
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

  // Backs the clickable status cards atop the admin Products page — each
  // count here corresponds 1:1 to a `stockStatus`/`isActive`/`lowStock`
  // filter combination `findAllAdmin` accepts, so clicking a card is just
  // "call findAllAdmin with these params" on the frontend.
  async getAdminStats() {
    await this.autoPublishDueSchedules();
    const [total, active, inactive, outOfStock, onBackorder, lowStock] = await Promise.all([
      this.productsRepo.count(),
      this.productsRepo.count({ where: { isPublished: true } }),
      this.productsRepo.count({ where: { isPublished: false } }),
      this.baseQuery()
        .andWhere('variants.stockStatus = :status', { status: StockStatus.OUT_OF_STOCK })
        .getCount(),
      this.baseQuery()
        .andWhere('variants.stockStatus = :status', { status: StockStatus.ON_BACKORDER })
        .getCount(),
      this.baseQuery()
        .andWhere('variants.stockStatus = :status', { status: StockStatus.IN_STOCK })
        .andWhere('variants.stockQuantity IS NOT NULL')
        .andWhere('variants.stockQuantity > 0')
        .andWhere('variants.stockQuantity <= COALESCE(variants.lowStockThreshold, :threshold)', {
          threshold: LOW_STOCK_THRESHOLD,
        })
        .getCount(),
    ]);

    return { total, active, inactive, outOfStock, onBackorder, lowStock };
  }

  async findBySlug(slug: string, password?: string) {
    await this.autoPublishDueSchedules();
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
        'seo',
      ],
    });
    if (!product) throw new NotFoundException(`Product "${slug}" not found`);

    const notFound = () => new NotFoundException(`Product "${slug}" not found`);

    const now = new Date();
    const isScheduledForFuture =
      !!product.scheduledPublishAt && product.scheduledPublishAt > now;

    if (!product.isPublished || isScheduledForFuture) {
      throw notFound();
    }

    if (product.visibility === ProductVisibility.PRIVATE) {
      throw notFound();
    }

    if (product.visibility === ProductVisibility.PASSWORD_PROTECTED) {
      if (!password || password !== product.visibilityPassword) {
        throw notFound();
      }
    }

    return this.decorate(product);
  }

  async findFeatured(limit = 12) {
    await this.autoPublishDueSchedules();
    const products = await this.applyPublicVisibility(this.baseQuery())
      .andWhere('product.isFeatured = true')
      .take(limit)
      .getMany();
    return this.decorateAll(products);
  }

  // Related products: same category first, then products sharing at least one
  // function tag — useful for the "you may also need" panel on a product page.
  async findRelated(slug: string, limit = 8) {
    await this.autoPublishDueSchedules();
    const product = await this.productsRepo.findOne({
      where: { slug },
      relations: ['functions'],
    });
    if (!product) throw new NotFoundException(`Product "${slug}" not found`);

    const functionIds = product.functions.map((f) => f.id);

    const qb = this.applyPublicVisibility(this.baseQuery())
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
    await this.autoPublishDueSchedules();
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
      AND p."isPublished" = true
      AND (p."scheduledPublishAt" IS NULL OR p."scheduledPublishAt" <= NOW())
      AND p."visibility" = 'PUBLIC'
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
    await this.autoPublishDueSchedules();
    const products = await this.applyPublicVisibility(
      this.productsRepo
        .createQueryBuilder('product')
        .select(['product.id', 'product.name', 'product.slug', 'product.isPublished', 'product.scheduledPublishAt', 'product.visibility']),
    )
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
    const { variants, functionIds, certificationIds, gallery, specs, seo, scheduledPublishAt, ...productData } = dto;
    const product = this.productsRepo.create({
      ...productData,
      // Overrides productData.isPublished: a future schedule always forces
      // Draft, a past/present one publishes immediately and clears itself.
      ...resolveScheduleFields(scheduledPublishAt),
      // Single unified image list from the admin's perspective: whichever
      // image is first in `gallery` is the "cover"/main image. `imageUrl`
      // stays as a real column (every other page/query already reads it
      // directly) but is now always derived, never set independently.
      imageUrl: gallery && gallery.length > 0 ? gallery[0].url : productData.imageUrl,
      functions: functionIds?.map((id) => ({ id })) as any,
      certifications: certificationIds?.map((id) => ({ id })) as any,
      variants: variants.map((v) =>
        this.variantsRepo.create({
          ...v,
          price: String(v.price),
          salePrice: v.salePrice != null ? String(v.salePrice) : null,
          stockStatus: resolveStockStatus(v),
          availableFrom: v.availableFrom ? new Date(v.availableFrom) : null,
        }),
      ),
      gallery: gallery?.map((g, i) =>
        this.galleryRepo.create({
          url: g.url,
          altText: g.altText ?? null,
          sortOrder: g.sortOrder ?? i,
        }),
      ),
    });
    const saved = await this.productsRepo.save(product);

    if (specs) {
      const newSpecs = specs.map((s) => this.specsRepo.create({ ...s, productId: saved.id }));
      await this.specsRepo.save(newSpecs);
    }

    if (seo) {
      await this.upsertSeo(saved.id, seo);
    }

    this.logger.log(`Product created: "${saved.name}" (id=${saved.id}, sku=${saved.sku})`);
    return saved;
  }

  // Upsert (not delete-then-recreate) since ProductSeo is a single 1:1 row,
  // unlike the list-shaped variants/gallery/specs.
  private async upsertSeo(productId: number, seo: NonNullable<CreateProductDto['seo']>) {
    const existing = await this.seoRepo.findOne({ where: { productId } });
    const merged = this.seoRepo.create({ ...existing, ...seo, productId });
    await this.seoRepo.save(merged);
  }

  async update(id: number, dto: UpdateProductDto) {
    const { variants, functionIds, certificationIds, gallery, specs, seo, scheduledPublishAt, ...productData } = dto;
    const product = await this.productsRepo.preload({
      id,
      ...productData,
      // Overrides productData.isPublished when a schedule is being set/cleared
      // in this request: a future schedule always forces Draft, a past/present
      // one publishes immediately and clears itself. Omitted entirely (not
      // `{}` but truly absent) when scheduledPublishAt isn't part of this
      // PATCH at all, leaving isPublished/scheduledPublishAt untouched.
      ...resolveScheduleFields(scheduledPublishAt),
      // Same derivation as create(): the first gallery image is always the
      // cover/main image. An explicitly-sent empty gallery ([]) clears the
      // cover back to null rather than leaving a stale imageUrl behind.
      ...(gallery ? { imageUrl: gallery.length > 0 ? gallery[0].url : null } : {}),
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
          stockStatus: resolveStockStatus(v),
          availableFrom: v.availableFrom ? new Date(v.availableFrom) : null,
        }),
      );
      await this.variantsRepo.save(newVariants);
    }

    // Same delete-then-recreate approach as variants above.
    if (gallery) {
      await this.galleryRepo.delete({ productId: id });
      const newGallery = gallery.map((g, i) =>
        this.galleryRepo.create({
          productId: id,
          url: g.url,
          altText: g.altText ?? null,
          sortOrder: g.sortOrder ?? i,
        }),
      );
      await this.galleryRepo.save(newGallery);
    }

    // Same delete-then-recreate approach as variants/gallery above.
    if (specs) {
      await this.specsRepo.delete({ productId: id });
      const newSpecs = specs.map((s) => this.specsRepo.create({ ...s, productId: id }));
      await this.specsRepo.save(newSpecs);
    }

    if (seo) {
      await this.upsertSeo(id, seo);
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
