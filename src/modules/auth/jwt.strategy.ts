import { Injectable, InternalServerErrorException, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '../../entities';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger('JwtStrategy');

  // UsersService comes from UsersModule, which AuthModule already imports —
  // no extra wiring needed.
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'change-me',
    });
  }

  // Loads the user on every authenticated request rather than trusting the
  // token payload. That's what makes a soft delete (and a role change) take
  // effect immediately instead of whenever the 15-minute access token
  // happens to expire. Cost is one indexed primary-key lookup of four scalar
  // columns — see UsersService.authLookup.
  async validate(payload: JwtPayload) {
    let user;
    try {
      user = await this.usersService.authLookup(payload.sub);
    } catch (err) {
      // A database blip must NOT surface as 401. The frontend api client
      // treats 401 as "try refresh, then force logout", so answering 401
      // here would sign out every logged-in user during a transient outage.
      // 500 is retryable; 401 is not.
      this.logger.error(
        `Auth lookup failed for user #${payload.sub}: ${err instanceof Error ? err.message : err}`,
      );
      throw new InternalServerErrorException('Could not verify your session — please try again.');
    }

    if (!user) {
      // Token for a user that no longer exists (permanently deleted).
      throw new UnauthorizedException('Your session is no longer valid.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('This account is no longer active.');
    }

    // Role comes from the DB, not payload.role — RolesGuard reads
    // req.user.role, so a role change also applies immediately.
    return { id: user.id, email: user.email, role: user.role };
  }
}
