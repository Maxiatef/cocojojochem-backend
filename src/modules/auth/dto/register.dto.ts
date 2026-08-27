import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Password must include an uppercase letter, a lowercase letter, a number, and a special character.',
  })
  password: string;

  @IsString()
  fullName: string;

  // Must include a country calling code (e.g. "+1 5551234567") and contain no letters.
  @Matches(/^\+[1-9]\d{0,3}\s?\d{6,14}$/, {
    message: 'Phone must include a country code (e.g. +1 5551234567) and contain digits only.',
  })
  phone: string;

  @IsOptional()
  @IsString()
  companyName?: string;
}
