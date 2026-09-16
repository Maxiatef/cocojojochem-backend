import { IsEmail, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStaffUserDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsInt()
  roleId: number;

  @IsOptional()
  @IsInt()
  teamId?: number | null;
}
