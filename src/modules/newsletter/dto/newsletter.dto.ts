import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** The private preferences token: 32 random bytes, hex. */
const TOKEN = /^[a-f0-9]{64}$/;

export class SubscribeNewsletterDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  interests: string[];

  @IsBoolean()
  consent: boolean;

  // Honeypot: a hidden field people never fill in.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

export class NewsletterTokenDto {
  @Matches(TOKEN, { message: 'Use your private preferences link to manage this signup.' })
  token: string;
}

export class UpdateNewsletterPreferencesDto extends NewsletterTokenDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  interests: string[];

  @IsOptional()
  @IsBoolean()
  consent?: boolean;
}
