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

  // Comma-separated statuses, e.g. "DELETED" for the admin Recycle Bin.
  // Omitted means ACTIVE only — see UsersService.applyUserFilters.
  @IsOptional()
  @IsString()
  status?: string;
}
