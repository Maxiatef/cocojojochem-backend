import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Testimonial } from '../../entities';

@Injectable()
export class TestimonialsService {
  constructor(
    @InjectRepository(Testimonial)
    private readonly testimonialsRepo: Repository<Testimonial>,
  ) {}

  findPublished() {
    return this.testimonialsRepo.find({
      where: { isPublished: true },
      order: { sortOrder: 'ASC' },
    });
  }

  create(data: Partial<Testimonial>) {
    const testimonial = this.testimonialsRepo.create(data);
    return this.testimonialsRepo.save(testimonial);
  }
}
