import { IsEmail, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
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
  @IsInt()
  roleId?: number | null;

  // Null clears the team. Validated as an int rather than a positive int so
  // the "no team" case can be sent explicitly instead of by omission — the
  // service distinguishes undefined (leave alone) from null (remove).
  @IsOptional()
  @IsInt()
  teamId?: number | null;

  @IsOptional()
  companyId?: number | null;
}

export class AdminSetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword: string;
}
