import { IsOptional, IsString } from 'class-validator';

export class QueryUsersDto {
  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;

  @IsOptional()
  @IsString()
  search?: string;

  // Comma-separated role ids, e.g. "1,2", plus two sentinels:
  //   "none"  — users with no role at all, i.e. customers
  //   "staff" — users holding any role, whichever roles happen to exist
  // The "staff" sentinel exists so the admin Staff filter doesn't have to
  // enumerate role ids client-side, which silently broke whenever the roles
  // list failed to load.
  @IsOptional()
  @IsString()
  roleId?: string;

  // Comma-separated statuses, e.g. "DELETED" for the admin Recycle Bin.
  // Omitted means ACTIVE only — see UsersService.applyUserFilters.
  @IsOptional()
  @IsString()
  status?: string;
}
