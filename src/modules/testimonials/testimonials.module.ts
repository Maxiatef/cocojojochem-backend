import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Testimonial } from '../../entities';
import { TestimonialsService } from './testimonials.service';
import { TestimonialsController } from './testimonials.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Testimonial])],
  controllers: [TestimonialsController],
  providers: [TestimonialsService],
})
export class TestimonialsModule {}
