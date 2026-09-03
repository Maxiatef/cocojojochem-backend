import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordResetRequest, RefreshToken } from '../../entities';

// Both PasswordResetRequest and RefreshToken store only hashes (never the
// raw code/token), so an old row isn't a security risk sitting in the DB —
// this is pure housekeeping, not a security measure. Runs daily; deletes
// rows that are no longer usable for anything: expired, or already
// consumed (password-reset requests with usedAt set, refresh tokens with
// revokedAt set).
@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger('AuthCleanup');

  constructor(
    @InjectRepository(PasswordResetRequest)
    private readonly passwordResetRepo: Repository<PasswordResetRequest>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredAuthArtifacts(): Promise<void> {
    const now = new Date();

    const resetResult = await this.passwordResetRepo
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now })
      .orWhere('usedAt IS NOT NULL')
      .execute();

    const refreshResult = await this.refreshTokenRepo
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now })
      .orWhere('revokedAt IS NOT NULL')
      .execute();

    this.logger.log(
      `Cleanup: removed ${resetResult.affected ?? 0} password-reset request(s), ` +
        `${refreshResult.affected ?? 0} refresh token(s).`,
    );
  }
}
