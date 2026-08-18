import { IsOptional, IsString } from 'class-validator';

export class QueryUsersDto {
  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;

  @IsOptional()
  @IsString()
  search?: string;

  // Comma-separated roles, e.g. "ADMIN,SALES"
  @IsOptional()
  @IsString()
  role?: string;
}
