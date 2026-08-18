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
