import { PartialType } from '@nestjs/mapped-types';
import { CreateSeoPageDto } from './create-seo-page.dto';

export class UpdateSeoPageDto extends PartialType(CreateSeoPageDto) {}
