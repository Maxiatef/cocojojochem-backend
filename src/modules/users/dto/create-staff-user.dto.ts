import { IsEmail, IsInt, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

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

  @IsUUID('4')
  roleId: string;

  @IsOptional()
  @IsInt()
  teamId?: string | null;
}
