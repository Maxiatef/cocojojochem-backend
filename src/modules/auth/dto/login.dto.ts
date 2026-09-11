import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

/**
 * The @ApiProperty decorators are what put a filled-in request body in
 * Swagger's "Try it out" editor. Without them the generated schema has no
 * properties at all — TypeScript types are erased at runtime, and this project
 * doesn't enable the Nest Swagger CLI plugin — so the body renders as `{}` and
 * has to be typed by hand every time.
 *
 * NOTE: these defaults are working local admin credentials. /api/docs is
 * currently mounted unconditionally in src/main.ts, so they are readable by
 * anyone who opens the docs page on a deployed environment.
 */
export class LoginDto {
  @ApiProperty({ example: 'admin@cocojojochem.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123@' })
  @IsString()
  password: string;
}
