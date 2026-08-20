import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { CompaniesService } from '../companies/companies.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AccountStatus, UserRole } from '../../entities';

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly usersService: UsersService,
    private readonly companiesService: CompaniesService,
    private readonly jwtService: JwtService,
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

    const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
    this.logger.log(
      `User logged in: ${user.email} (id=${user.id}, role=${user.role}) — token valid for ${expiresIn}`,
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

  private buildToken(sub: number, email: string, role: string) {
    const accessToken = this.jwtService.sign({ sub, email, role });
    return { accessToken };
  }
}
