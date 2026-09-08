import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order, PasswordResetRequest, QuoteRequest, RefreshToken, User } from '../../entities';
import { EmailModule } from '../email/email.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

// RefreshToken/PasswordResetRequest are wired in here (rather than reaching
// for AuthService) on purpose: AuthModule already imports UsersModule, so
// depending back on AuthService would be a circular dependency needing
// forwardRef. Owning the two repositories directly keeps the graph acyclic.
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Order, QuoteRequest, RefreshToken, PasswordResetRequest]),
    EmailModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
