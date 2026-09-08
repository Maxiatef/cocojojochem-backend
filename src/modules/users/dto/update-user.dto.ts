import { IsEmail, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../../entities';

export class UpdateUserDto {
  // Still accepted so existing callers keep working. When firstName/lastName
  // are sent instead, the service recomposes fullName from them.
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @IsOptional()
  @IsString()
  firstName?: string | null;

  @IsOptional()
  @IsString()
  lastName?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // Explicitly nullable — allows unassigning a user from their company.
  @IsOptional()
  companyId?: number | null;
}

export class AdminSetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword: string;
}
