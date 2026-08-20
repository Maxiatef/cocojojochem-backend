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
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
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

  @Post()
  create(@Body() dto: CreateFunctionDto) {
    return this.functionsService.create(dto.name, dto.slug, dto.description);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFunctionDto) {
    return this.functionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.functionsService.remove(id);
  }
}
