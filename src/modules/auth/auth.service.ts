import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { CompaniesService } from '../companies/companies.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AccountStatus, RefreshToken, PasswordResetRequest, UserRole } from '../../entities';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes — window to actually set the new password after verifying the code
const MAX_RESET_CODE_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly usersService: UsersService,
    private readonly companiesService: CompaniesService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordResetRequest)
    private readonly passwordResetRepo: Repository<PasswordResetRequest>,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      this.logger.warn(`Registration rejected — email already in use: ${dto.email}`);
      throw new ConflictException('Email already registered');
    }

    let companyId: number | undefined;
    if (dto.companyName) {
      const company = await this.companiesService.create({
        name: dto.companyName,
        website: dto.companyWebsite || null,
        status: AccountStatus.PENDING,
      });
      companyId = company.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone,
      role: UserRole.CUSTOMER,
      companyId,
    });

    this.logger.log(`New user registered: ${user.email} (id=${user.id}, role=${user.role})`);
    return this.buildToken(user.id, user.email, user.role);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      this.logger.warn(`Login failed — no account for email: ${dto.email}`);
      throw new NotFoundException('No account found with this email');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      this.logger.warn(`Login failed — bad password for: ${user.email} (id=${user.id})`);
      throw new UnauthorizedException('Incorrect email or password');
    }

    this.logger.log(
      `User logged in: ${user.email} (id=${user.id}, role=${user.role})`,
    );
    return this.buildToken(user.id, user.email, user.role);
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.usersService.findById(userId);
    if (!user.passwordHash) {
      throw new BadRequestException('This account has no password set');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      this.logger.warn(`Password change rejected — incorrect current password for user #${userId}`);
      throw new UnauthorizedException('Current password is incorrect');
    }

    const sameAsBefore = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (sameAsBefore) {
      throw new BadRequestException('New password must be different from the current password');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.save(user);
    this.logger.log(`Password changed for user #${userId} (${user.email})`);
    return { success: true };
  }

  // Always responds the same way whether or not the email has an account —
  // otherwise this endpoint could be used to enumerate registered emails.
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (user) {
      const code = String(crypto.randomInt(0, 100000)).padStart(5, '0');
      const codeHash = this.hashToken(code);
      await this.passwordResetRepo.save(
        this.passwordResetRepo.create({
          userId: user.id,
          codeHash,
          attempts: 0,
          verifiedTokenHash: null,
          expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
          usedAt: null,
        }),
      );

      try {
        await this.emailService.sendPasswordResetCode(user.email, code);
        this.logger.log(`Password reset code sent to ${user.email} (user #${user.id})`);
      } catch (err) {
        this.logger.warn(
          `Failed to send password reset code to ${user.email}: ${err instanceof Error ? err.message : err}`,
        );
      }
    } else {
      this.logger.warn(`Password reset requested for unknown email: ${dto.email}`);
    }

    return { success: true };
  }

  // Confirms the 5-digit code and exchanges it for a single-use, high-entropy
  // reset token — the frontend carries that token (not the code) into the
  // final resetPassword() call, so the low-entropy code can't be replayed.
  async verifyResetCode(dto: VerifyResetCodeDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    const request = await this.passwordResetRepo.findOne({
      where: { userId: user.id },
      order: { createdAt: 'DESC' },
    });

    if (!request || request.usedAt || request.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (request.attempts >= MAX_RESET_CODE_ATTEMPTS) {
      throw new UnauthorizedException('Too many attempts — please request a new code');
    }

    const codeHash = this.hashToken(dto.code);
    if (codeHash !== request.codeHash) {
      request.attempts += 1;
      await this.passwordResetRepo.save(request);
      throw new UnauthorizedException('Invalid or expired code');
    }

    const rawResetToken = crypto.randomBytes(32).toString('hex');
    request.verifiedTokenHash = this.hashToken(rawResetToken);
    await this.passwordResetRepo.save(request);

    return { resetToken: rawResetToken };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const verifiedTokenHash = this.hashToken(dto.resetToken);
    const request = await this.passwordResetRepo.findOne({ where: { verifiedTokenHash } });

    if (!request || request.usedAt || request.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }
    // Verified tokens get a slightly longer window than the raw code so the
    // customer has time to fill out the new-password step.
    if (Date.now() - request.createdAt.getTime() > RESET_CODE_TTL_MS + RESET_TOKEN_TTL_MS) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const user = await this.usersService.findById(request.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.save(user);

    request.usedAt = new Date();
    await this.passwordResetRepo.save(request);

    this.logger.log(`Password reset via forgot-password flow for user #${user.id} (${user.email})`);
    return { success: true };
  }

  // Rotates the refresh token: the old row is revoked and a brand new
  // access+refresh pair is issued. Hot path — kept to one SELECT (indexed on
  // tokenHash) + one UPDATE + one INSERT, no bcrypt anywhere in this call.
  async refresh(rawRefreshToken: string) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const tokenHash = this.hashToken(rawRefreshToken);
    const existing = await this.refreshTokenRepo.findOne({ where: { tokenHash } });

    if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(existing.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    existing.revokedAt = new Date();
    await this.refreshTokenRepo.save(existing);

    return this.buildToken(user.id, user.email, user.role);
  }

  // The refresh token itself is the credential (no JWT guard needed).
  // No-op on an unknown token — same response shape either way, so callers
  // can't probe for whether a given token ever existed.
  async logout(rawRefreshToken: string) {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);
      const existing = await this.refreshTokenRepo.findOne({ where: { tokenHash } });
      if (existing && !existing.revokedAt) {
        existing.revokedAt = new Date();
        await this.refreshTokenRepo.save(existing);
      }
    }
    return { success: true };
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  private async buildToken(sub: number, email: string, role: string) {
    const accessToken = this.jwtService.sign(
      { sub, email, role },
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
    );

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId: sub,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
      }),
    );

    return { accessToken, refreshToken: rawRefreshToken };
  }
}
