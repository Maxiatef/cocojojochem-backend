import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FunctionsService } from './functions.service';

class CreateFunctionDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateFunctionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@ApiTags('Functions')
@Controller('wholesale/functions')
export class FunctionsController {
  constructor(private readonly functionsService: FunctionsService) {}

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
    @Query('sort') sort?: string,
  ) {
    return this.functionsService.findAll(Number(page), Number(limit), search, sort);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.functionsService.findBySlug(slug);
  }

  @Get(':slug/products')
  findProducts(
    @Param('slug') slug: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.functionsService.findProducts(slug, Number(page), Number(limit));
  }

  // Writes are ADMIN-only. These endpoints previously had no guard at
  // all, so any anonymous caller could mutate the catalog.
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateFunctionDto) {
    return this.functionsService.create(dto.name, dto.slug, dto.description);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFunctionDto) {
    return this.functionsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.functionsService.remove(id);
  }
}
