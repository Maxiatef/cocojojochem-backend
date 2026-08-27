import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyResetCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(5, 5)
  code: string;
}
