import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { TestimonialsService } from './testimonials.service';
import { CreateTestimonialDto, UpdateTestimonialDto } from './dto/testimonial.dto';

@ApiTags('Testimonials')
@Controller('wholesale/testimonials')
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  // Public storefront list — published only, no auth.
  @Get()
  findAll() {
    return this.testimonialsService.findPublished();
  }

  // Declared before ':id' — 'admin' would otherwise be swallowed as an id
  // and rejected by ParseUUIDPipe on that route.
  @Get('admin')
  @RequirePermission('canViewTestimonials')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findAllAdmin() {
    return this.testimonialsService.findAllAdmin();
  }

  @Get(':id')
  @RequirePermission('canViewTestimonials')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.testimonialsService.findOne(id);
  }

  @Post()
  @RequirePermission('canCreateTestimonial')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  create(@Body() dto: CreateTestimonialDto) {
    return this.testimonialsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('canEditTestimonial')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTestimonialDto) {
    return this.testimonialsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('canDeleteTestimonial')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.testimonialsService.remove(id);
  }
}
