import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsString()
  fullName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}
