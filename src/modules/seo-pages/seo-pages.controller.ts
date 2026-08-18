import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SeoPagesService } from './seo-pages.service';
import { CreateSeoPageDto } from './dto/create-seo-page.dto';
import { UpdateSeoPageDto } from './dto/update-seo-page.dto';

@ApiTags('SEO Pages')
@ApiBearerAuth('access-token')
@Controller('seo-pages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SeoPagesController {
  constructor(private readonly seoPagesService: SeoPagesService) {}

  @Get()
  findAll() {
    return this.seoPagesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.seoPagesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSeoPageDto) {
    return this.seoPagesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSeoPageDto) {
    return this.seoPagesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.seoPagesService.remove(id);
  }
}
