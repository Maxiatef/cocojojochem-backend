import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Category, Product } from '../../entities';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger('Categories');

  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepo: Repository<Category>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
  ) {}

  // Mirrors the live cocojojo.com shape: each category carries its own live product count.
  async findAll(page = 1, limit = 50, search?: string, sort?: string) {
    const qb = this.categoriesRepo
      .createQueryBuilder('category')
      .loadRelationCountAndMap('category.productCount', 'category.products', 'product', (qb) =>
        qb.andWhere('product.isPublished = true'),
      );

    if (search) {
      qb.andWhere('category.name ILIKE :search', { search: `%${search}%` });
    }

    if (sort === 'products_desc' || sort === 'products_asc') {
      // loadRelationCountAndMap's subquery alias isn't addressable in ORDER BY, so
      // add a second, orderable count subquery alongside it.
      qb.addSelect((subQb) => {
        return subQb
          .select('COUNT(*)', 'cnt')
          .from('products', 'p')
          .where('p."categoryId" = category.id')
          .andWhere('p."isPublished" = true');
      }, 'product_count').orderBy('product_count', sort === 'products_desc' ? 'DESC' : 'ASC');
    } else if (sort === 'name_desc') {
      qb.orderBy('category.name', 'DESC');
    } else if (sort === 'name_asc') {
      qb.orderBy('category.name', 'ASC');
    } else {
      qb.orderBy('category.sortOrder', 'ASC').addOrderBy('category.name', 'ASC');
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // Nested parent/children tree, e.g. Acids -> Amino Acids, for a sidebar/menu view.
  async findTree() {
    const roots = await this.categoriesRepo.find({
      where: { parentId: IsNull() },
      relations: ['children'],
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return roots;
  }

  async findBySlug(slug: string) {
    const category = await this.categoriesRepo
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.children', 'children')
      .loadRelationCountAndMap('category.productCount', 'category.products', 'product', (qb) =>
        qb.andWhere('product.isPublished = true'),
      )
      .where('category.slug = :slug', { slug })
      .getOne();
    if (!category) throw new NotFoundException(`Category "${slug}" not found`);
    return category;
  }

  // Products within a category, including its subcategory products — join across
  // category -> product -> variants/functions, same shape as the product list endpoint.
  async findProducts(slug: string, page = 1, limit = 20) {
    const category = await this.categoriesRepo.findOne({
      where: { slug },
      relations: ['children'],
    });
    if (!category) throw new NotFoundException(`Category "${slug}" not found`);

    const categoryIds = [category.id, ...category.children.map((c) => c.id)];

    const [data, total] = await this.productsRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.variants', 'variants')
      .leftJoinAndSelect('product.functions', 'functions')
      .where('product.categoryId IN (:...categoryIds)', { categoryIds })
      .andWhere('product.isPublished = true')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { category, data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // Full detail for the admin "View Category" page: category + parent + children + all its
  // products (including unpublished ones — this is admin-only, unlike findProducts/findBySlug).
  async findByIdWithProducts(id: number) {
    const category = await this.categoriesRepo.findOne({
      where: { id },
      relations: ['parent', 'children'],
    });
    if (!category) throw new NotFoundException(`Category #${id} not found`);

    const products = await this.productsRepo.find({
      where: { categoryId: id },
      relations: ['variants'],
      order: { name: 'ASC' },
    });

    return { ...category, products };
  }

  async create(dto: CreateCategoryDto) {
    const category = this.categoriesRepo.create(dto);
    const saved = await this.categoriesRepo.save(category);
    this.logger.log(`Category created: "${saved.name}" (id=${saved.id})`);
    return saved;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const category = await this.categoriesRepo.preload({ id, ...dto });
    if (!category) throw new NotFoundException(`Category #${id} not found`);
    const saved = await this.categoriesRepo.save(category);
    this.logger.log(`Category updated: "${saved.name}" (id=${saved.id})`);
    return saved;
  }

  async remove(id: number) {
    const category = await this.categoriesRepo.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`Category #${id} not found`);
    this.logger.log(`Category deleted: "${category.name}" (id=${category.id})`);
    return this.categoriesRepo.remove(category);
  }
}
