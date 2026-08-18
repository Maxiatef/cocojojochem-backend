import { IsOptional, IsString } from 'class-validator';

export class CreateSeoPageDto {
  @IsString()
  path: string;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  ogImageUrl?: string;
}
