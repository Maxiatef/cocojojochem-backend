import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { CompaniesModule } from '../companies/companies.module';
import { EmailModule } from '../email/email.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RefreshToken, PasswordResetRequest } from '../../entities';

@Module({
  imports: [
    UsersModule,
    CompaniesModule,
    EmailModule,
    PassportModule,
    TypeOrmModule.forFeature([RefreshToken, PasswordResetRequest]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-me',
      // Access token lifetime. Kept short (15m default) so a stolen access
      // token has a small blast radius; the refresh token (30d, DB-backed,
      // rotated) is what keeps the user's session alive.
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
