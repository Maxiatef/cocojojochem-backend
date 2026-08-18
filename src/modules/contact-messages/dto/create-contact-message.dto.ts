import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateContactMessageDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  subject: string;

  @IsString()
  message: string;
}
