import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Testimonial } from '../../entities';
import { CreateTestimonialDto, UpdateTestimonialDto } from './dto/testimonial.dto';

@Injectable()
export class TestimonialsService {
  constructor(
    @InjectRepository(Testimonial)
    private readonly testimonialsRepo: Repository<Testimonial>,
  ) {}

  /** Storefront: published only. */
  findPublished() {
    return this.testimonialsRepo.find({
      where: { isPublished: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  /**
   * Admin: everything, drafts included. Ordered the same way the storefront
   * will render them, so the admin list reads as the running order rather
   * than as an arbitrary sequence.
   */
  findAllAdmin() {
    return this.testimonialsRepo.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async findOne(id: string) {
    const testimonial = await this.testimonialsRepo.findOne({ where: { id } });
    if (!testimonial) throw new NotFoundException(`Testimonial #${id} not found`);
    return testimonial;
  }

  create(dto: CreateTestimonialDto) {
    const testimonial = this.testimonialsRepo.create({
      authorName: dto.authorName.trim(),
      quote: dto.quote.trim(),
      company: dto.company?.trim() || null,
      result: dto.result?.trim() || null,
      imageUrl: dto.imageUrl?.trim() || null,
      isPublished: dto.isPublished ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.testimonialsRepo.save(testimonial);
  }

  async update(id: string, dto: UpdateTestimonialDto) {
    const testimonial = await this.findOne(id);

    // Assigned field by field rather than Object.assign(dto), so an unknown
    // key in the body can never reach the row, and so `save()` sees a loaded
    // entity — which is what lets the audit subscriber record a real diff.
    if (dto.authorName !== undefined) testimonial.authorName = dto.authorName.trim();
    if (dto.quote !== undefined) testimonial.quote = dto.quote.trim();
    if (dto.company !== undefined) testimonial.company = dto.company?.trim() || null;
    if (dto.result !== undefined) testimonial.result = dto.result?.trim() || null;
    if (dto.imageUrl !== undefined) testimonial.imageUrl = dto.imageUrl?.trim() || null;
    if (dto.isPublished !== undefined) testimonial.isPublished = dto.isPublished;
    if (dto.sortOrder !== undefined) testimonial.sortOrder = dto.sortOrder;

    return this.testimonialsRepo.save(testimonial);
  }

  async remove(id: string) {
    const testimonial = await this.findOne(id);
    // remove(), not delete() — delete() fires no subscriber event, so the
    // deletion would be invisible to the audit log.
    await this.testimonialsRepo.remove(testimonial);
    return { success: true };
  }
}
