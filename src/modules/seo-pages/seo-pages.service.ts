import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoPage } from '../../entities';
import { CreateSeoPageDto } from './dto/create-seo-page.dto';
import { UpdateSeoPageDto } from './dto/update-seo-page.dto';

@Injectable()
export class SeoPagesService {
  private readonly logger = new Logger('SeoPages');

  constructor(
    @InjectRepository(SeoPage)
    private readonly seoPagesRepo: Repository<SeoPage>,
  ) {}

  findAll() {
    return this.seoPagesRepo.find({ order: { id: 'ASC' } });
  }

  async findByPath(path: string) {
    if (!path) return null;
    return this.seoPagesRepo.findOne({ where: { path } });
  }

  async findOne(id: number) {
    const page = await this.seoPagesRepo.findOne({ where: { id } });
    if (!page) throw new NotFoundException(`SEO page #${id} not found`);
    return page;
  }

  /**
   * Creates or updates the override for a path in one call.
   *
   * The admin SEO table edits a CRAWLED path, which may or may not already
   * have a row. Making the UI discover that first — POST, catch the 409, then
   * PATCH by id — puts a race and two round trips in the way of a Save button,
   * so the decision is made here where the unique index on `path` can settle
   * it.
   *
   * A null or empty value clears the override rather than storing a blank,
   * so the storefront falls back to its hardcoded default exactly as it does
   * when no row exists at all.
   */
  async upsertByPath(path: string, dto: UpdateSeoPageDto) {
    const clean = (value: string | null | undefined) => {
      const trimmed = (value ?? '').trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const existing = await this.seoPagesRepo.findOne({ where: { path } });
    const page =
      existing ||
      this.seoPagesRepo.create({ path, metaTitle: null, metaDescription: null, ogImageUrl: null });

    // Only fields actually present in the payload are touched, so a form that
    // submits three of four columns does not blank the fourth.
    if ('metaTitle' in dto) page.metaTitle = clean(dto.metaTitle);
    if ('metaDescription' in dto) page.metaDescription = clean(dto.metaDescription);
    if ('ogImageUrl' in dto) page.ogImageUrl = clean(dto.ogImageUrl);
    if ('focusKeyphrase' in dto) page.focusKeyphrase = clean(dto.focusKeyphrase);

    const saved = await this.seoPagesRepo.save(page);
    this.logger.log(`SEO override ${existing ? 'updated' : 'created'} for ${path}`);
    return saved;
  }

  async create(dto: CreateSeoPageDto) {
    const existing = await this.seoPagesRepo.findOne({ where: { path: dto.path } });
    if (existing) throw new ConflictException(`An SEO entry for path "${dto.path}" already exists`);
    const page = this.seoPagesRepo.create(dto);
    const saved = await this.seoPagesRepo.save(page);
    this.logger.log(`SEO page created: ${saved.path} (id=${saved.id})`);
    return saved;
  }

  async update(id: number, dto: UpdateSeoPageDto) {
    const page = await this.findOne(id);
    Object.assign(page, dto);
    const saved = await this.seoPagesRepo.save(page);
    this.logger.log(`SEO page updated: ${saved.path} (id=${saved.id})`);
    return saved;
  }

  async remove(id: number) {
    const page = await this.findOne(id);
    await this.seoPagesRepo.remove(page);
    this.logger.log(`SEO page deleted: ${page.path} (id=${id})`);
    return { success: true };
  }
}
