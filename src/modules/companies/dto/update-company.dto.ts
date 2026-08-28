import { IsOptional, IsString } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  // Not strictly URL-validated — admins may clear this field to an empty
  // string, which IsUrl would reject; the admin table already normalizes a
  // bare domain (no protocol) to https:// for display either way.
  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  taxId?: string;
}
