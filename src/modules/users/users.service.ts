import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { IsNull, Repository, SelectQueryBuilder } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  Order,
  PasswordResetRequest,
  QuoteRequest,
  RefreshToken,
  User,
  UserRole,
  UserStatus,
  AuditAction,
  AuditActorType,
} from '../../entities';
import { hashToken } from '../../common/hash-token';
import { EmailService } from '../email/email.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// An admin-issued reset link is a convenience an admin hands to a real
// customer who may not read their mail immediately, so it gets a far longer
// life than the 10-minute self-service code. Still finite — a link that never
// expires is a permanent account takeover sitting in an inbox.
const ADMIN_RESET_LINK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class UsersService {
  private readonly logger = new Logger('Users');

  constructor(
    private readonly auditLog: AuditLogService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(QuoteRequest)
    private readonly quoteRequestsRepo: Repository<QuoteRequest>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordResetRequest)
    private readonly passwordResetRepo: Repository<PasswordResetRequest>,
    private readonly emailService: EmailService,
  ) {}

  findByEmail(email: string) {
    return this.usersRepo.findOne({ where: { email }, relations: ['company'] });
  }

  // Backs the clickable stat cards atop the admin Users page.
  // The four role counts are scoped to ACTIVE so they keep summing to Total —
  // recycled users are counted separately by the Recycle Bin tile instead.
  async getStats() {
    const [total, customers, sales, admins, deleted] = await Promise.all([
      this.usersRepo.count({ where: { status: UserStatus.ACTIVE } }),
      this.usersRepo.count({ where: { status: UserStatus.ACTIVE, role: UserRole.CUSTOMER } }),
      this.usersRepo.count({ where: { status: UserStatus.ACTIVE, role: UserRole.SALES } }),
      this.usersRepo.count({ where: { status: UserStatus.ACTIVE, role: UserRole.ADMIN } }),
      this.usersRepo.count({ where: { status: UserStatus.DELETED } }),
    ]);
    return { total, customers, sales, admins, deleted };
  }

  // Narrow per-request lookup for JwtStrategy. Deliberately not findById():
  // that joins `company` and throws NotFoundException (a 404, not a 401).
  // This runs on EVERY authenticated request, so it selects four scalar
  // columns off the primary key and nothing else.
  authLookup(id: number) {
    return this.usersRepo.findOne({
      where: { id },
      select: ['id', 'email', 'role', 'status'],
    });
  }

  async findById(id: number) {
    const user = await this.usersRepo.findOne({ where: { id }, relations: ['company'] });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return user;
  }

  create(data: Partial<User>) {
    const user = this.usersRepo.create(data);
    return this.usersRepo.save(user);
  }

  async updateProfile(id: number, data: Partial<Pick<User, 'fullName' | 'phone'>>) {
    const user = await this.findById(id);
    Object.assign(user, data);
    return this.usersRepo.save(user);
  }

  save(user: User) {
    return this.usersRepo.save(user);
  }

  // Shared by findAllAdmin's page query AND its separate count query. These
  // two used to carry duplicated copies of the same filters, which is exactly
  // how a filter gets added to one and not the other and the pagination
  // totals silently drift.
  private applyUserFilters(qb: SelectQueryBuilder<User>, query: QueryUsersDto) {
    if (query.search) {
      qb.andWhere('(user.fullName ILIKE :search OR user.email ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.role) {
      const roles = query.role.split(',').map((r) => r.trim().toUpperCase());
      qb.andWhere('user.role IN (:...roles)', { roles });
    }
    // Recycled users are hidden unless explicitly asked for, so the Recycle
    // Bin never leaks into the normal list — and any other caller that lists
    // users (e.g. a staff picker hitting ?role=SALES) gets that for free.
    if (query.status) {
      const statuses = query.status.split(',').map((x) => x.trim().toUpperCase());
      qb.andWhere('user.status IN (:...statuses)', { statuses });
    } else {
      qb.andWhere('user.status = :activeStatus', { activeStatus: UserStatus.ACTIVE });
    }
  }

  // Admin list — all users regardless of role, with company name, order count, and total spent.
  async findAllAdmin(query: QueryUsersDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const qb = this.usersRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.company', 'company')
      .leftJoin('user.orders', 'orders')
      .addSelect('COUNT(DISTINCT orders.id)', 'orderCount')
      .addSelect('COALESCE(SUM(orders.total), 0)', 'totalSpent')
      .groupBy('user.id')
      .addGroupBy('company.id')
      .orderBy('user.createdAt', 'DESC');

    this.applyUserFilters(qb, query);

    qb.offset((page - 1) * limit).limit(limit);

    const { entities, raw } = await qb.getRawAndEntities();
    const data = entities.map(({ passwordHash, ...user }, i) => ({
      ...user,
      orderCount: Number(raw[i]?.orderCount || 0),
      totalSpent: Number(raw[i]?.totalSpent || 0),
    }));

    const totalQb = this.usersRepo.createQueryBuilder('user');
    this.applyUserFilters(totalQb, query);
    const total = await totalQb.getCount();

    return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findDetail(id: number) {
    const { passwordHash, ...user } = await this.findById(id);
    // Full order history, not just a recent slice — the admin edit page
    // shows every order's full detail (items, shipping, tracking, totals)
    // for this user, so nothing should be silently truncated.
    const orders = await this.ordersRepo.find({
      where: { userId: id },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
    const quoteRequests = await this.quoteRequestsRepo.find({
      where: { userId: id },
      relations: ['items'],
      order: { createdAt: 'DESC' },
    });
    const [orderCountRaw, totalSpentRaw] = await Promise.all([
      this.ordersRepo.count({ where: { userId: id } }),
      this.ordersRepo
        .createQueryBuilder('order')
        .where('order.userId = :id', { id })
        .select('COALESCE(SUM(order.total), 0)', 'total')
        .getRawOne<{ total: string }>(),
    ]);
    return {
      ...user,
      orders,
      quoteRequests,
      orderCount: orderCountRaw,
      totalSpent: Number(totalSpentRaw?.total || 0),
      lastOrderDate: orders[0]?.createdAt ?? null,
    };
  }

  // Admin: full profile update — fullName/email/phone/role/companyId.
  // Self-demotion is blocked one level up in the controller (needs the
  // requesting admin's own id, which the service doesn't have).
  async updateUser(id: number, dto: UpdateUserDto) {
    const user = await this.findById(id);

    if (dto.email && dto.email !== user.email) {
      const existing = await this.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException('Email already registered to another account');
      }
      user.email = dto.email;
    }

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.firstName !== undefined) user.firstName = dto.firstName || null;
    if (dto.lastName !== undefined) user.lastName = dto.lastName || null;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.companyId !== undefined) user.companyId = dto.companyId;

    // Recompose the canonical display name from the parts the admin edited.
    // Only when a part was actually sent — a caller that PATCHes just
    // `fullName` (the pre-existing behaviour, and what the storefront does)
    // must keep setting it verbatim. Guarded against blanking a required
    // column: if both parts come back empty, the old fullName stands.
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      const composed = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
      if (composed) user.fullName = composed;
    }

    // Strip the hash before returning — this response goes straight to the
    // admin's browser on every save from the user editor, and there's no
    // reason for a bcrypt hash to travel over the wire. (GET /users/:id
    // already did this; the write paths didn't.)
    const { passwordHash, ...safeUser } = await this.usersRepo.save(user);
    return safeUser;
  }

  async setPassword(id: number, newPassword: string) {
    const user = await this.findById(id);
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepo.save(user);

    // Changing the password has to invalidate live sessions, or an admin
    // resetting a compromised account wouldn't actually lock the attacker
    // out — their existing refresh token would keep minting fresh access
    // tokens against the new password indefinitely.
    const revokedSessions = await this.revokeAllSessions(id);
    this.logger.log(`Admin set password for user #${id} (${user.email}); revoked ${revokedSessions} session(s)`);

    return { success: true, revokedSessions };
  }

  // --- Soft delete / restore / permanent delete ------------------------------

  // Admin accounts are never deletable through the UI: to offboard an admin,
  // change their role first. Shared by softDelete and purge.
  private assertDeletable(user: User, actingAdminId?: number) {
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Admin accounts cannot be deleted. Change the role to Sales or Customer first.',
      );
    }
    // Unreachable while the role check above stands, but kept so the
    // guarantee survives that rule being relaxed — mirrors the
    // self-demotion guard in the controller.
    if (actingAdminId != null && user.id === actingAdminId) {
      throw new ForbiddenException('You cannot delete your own account.');
    }
  }

  // Moves a user to the Recycle Bin: they can no longer log in, and existing
  // sessions are killed. Reversible — cart, quote list and quote requests are
  // deliberately left untouched so a restore is lossless.
  async softDelete(id: number, actingAdminId: number) {
    const user = await this.findById(id);
    this.assertDeletable(user, actingAdminId);

    // Idempotent: a double-clicked confirm button must not 400.
    if (user.status === UserStatus.DELETED) {
      return { success: true, alreadyDeleted: true, revokedSessions: 0 };
    }

    // Status is written FIRST because it's the authoritative gate — if the
    // revoke below failed, JwtStrategy and refresh() would still block them.
    user.status = UserStatus.DELETED;
    user.deletedAt = new Date();
    await this.usersRepo.save(user);

    const revokedSessions = await this.revokeAllSessions(id);

    // Otherwise a reset code already in their inbox is a way back in.
    await this.passwordResetRepo.update({ userId: id, usedAt: IsNull() }, { usedAt: new Date() });

    this.logger.log(
      `User #${id} (${user.email}) moved to recycle bin by admin #${actingAdminId}; revoked ${revokedSessions} session(s)`,
    );
    return { success: true, alreadyDeleted: false, revokedSessions };
  }

  async restore(id: number) {
    const user = await this.findById(id);
    if (user.status === UserStatus.ACTIVE) {
      return { success: true, alreadyActive: true };
    }
    user.status = UserStatus.ACTIVE;
    user.deletedAt = null;
    await this.usersRepo.save(user);
    // Sessions are NOT un-revoked — they sign in fresh.
    this.logger.log(`User #${id} (${user.email}) restored from recycle bin`);
    return { success: true, alreadyActive: false };
  }

  // Permanently removes the user row. Always succeeds for a recycled
  // non-admin: order history survives because the customer's details are
  // copied onto the order's guest columns before detaching, so revenue
  // reporting and order emails are unaffected.
  async purge(id: number) {
    const user = await this.findById(id);
    this.assertDeletable(user);

    // Must go through the bin first, so no single stray DELETE can remove a
    // live account.
    if (user.status !== UserStatus.DELETED) {
      throw new BadRequestException(
        'Only users in the Recycle Bin can be permanently deleted. Move them there first.',
      );
    }

    const [orderCount, quoteCount] = await Promise.all([
      this.ordersRepo.count({ where: { userId: id } }),
      this.quoteRequestsRepo.count({ where: { userId: id } }),
    ]);

    // One transaction: a partial run would leave a live user whose sessions
    // and cart had already been destroyed.
    await this.usersRepo.manager.transaction(async (m) => {
      // 1) orders.userId is ON DELETE NO ACTION, so it must be detached or
      //    the delete below fails. Copy the customer onto the guest columns
      //    first (all nullable, used for guest checkout) so the order keeps
      //    its contact details — EmailService resolves recipients as
      //    `order.user?.email || order.guestEmail`, so without this every
      //    future email for these orders would silently skip.
      //    COALESCE so a pre-existing guest value is never overwritten.
      await m.query(
        `UPDATE "orders"
            SET "guestEmail" = COALESCE("guestEmail", $2),
                "guestName"  = COALESCE("guestName",  $3),
                "guestPhone" = COALESCE("guestPhone", $4),
                "userId"     = NULL
          WHERE "userId" = $1`,
        [id, user.email, user.fullName, user.phone],
      );

      // 2) quote_requests.userId is also NO ACTION, but the row already
      //    stores its own fullName/email/phone, so detaching loses nothing.
      await m.query(`UPDATE "quote_requests" SET "userId" = NULL WHERE "userId" = $1`, [id]);

      // 3) These four carry a userId with NO foreign key at all — Postgres
      //    will not clean them up, so without this they'd be silently
      //    orphaned (live refresh tokens among them).
      await m.query(`DELETE FROM "refresh_tokens" WHERE "userId" = $1`, [id]);
      await m.query(`DELETE FROM "password_reset_requests" WHERE "userId" = $1`, [id]);
      await m.query(`DELETE FROM "quote_list_items" WHERE "userId" = $1`, [id]);
      await m.query(`DELETE FROM "pending_checkouts" WHERE "userId" = $1`, [id]);

      // 4) carts (ON DELETE CASCADE) and cart_items (cascade from carts) are
      //    removed transitively by this delete — noted so the omission reads
      //    as deliberate.
      //
      //    coupon_usages is keyed by email, not userId, so a purge does NOT
      //    reset this person's per-customer coupon limits. Deliberate:
      //    otherwise delete-and-recreate would be a coupon farm.
      await m.delete(User, { id });
    });

    this.logger.warn(
      `User #${id} (${user.email}) PERMANENTLY DELETED. ${orderCount} order(s) and ${quoteCount} quote request(s) detached and kept.`,
    );
    return { success: true, detachedOrders: orderCount, detachedQuoteRequests: quoteCount };
  }

  // Revokes every live refresh token for a user, signing them out of every
  // device. Access tokens already issued stay valid until they expire (15m
  // by default) — they're stateless JWTs with nothing to revoke.
  async revokeAllSessions(userId: number): Promise<number> {
    const result = await this.refreshTokenRepo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    const revoked = result.affected ?? 0;

    // Two reasons the subscriber can't see this: RefreshToken is skip-listed,
    // and `.update()` fires no usable event anyway. Forcing someone out of
    // every session is significant enough to record explicitly.
    if (revoked > 0) {
      const user = await this.authLookup(userId);
      await this.auditLog.record({
        action: AuditAction.SESSION_REVOKE,
        actorType: AuditActorType.ADMIN,
        actorId: userId,
        actorEmail: user?.email ?? null,
        actorRole: user?.role ?? null,
        entityName: 'User',
        entityId: String(userId),
        entityLabel: user?.email ?? null,
        summary: `Revoked ${revoked} active session${revoked === 1 ? '' : 's'} for ${user?.email ?? `user #${userId}`}`,
      });
    }

    return revoked;
  }

  // Admin "Send Reset Link": mints a password-reset request that is ALREADY
  // code-verified, so the emailed link drops the customer straight onto the
  // set-password page with no 5-digit code step. Deliberately reuses the
  // existing PasswordResetRequest table and the existing
  // POST /auth/reset-password endpoint rather than introducing a second,
  // parallel reset mechanism to keep secure.
  async sendPasswordResetLink(id: number) {
    const user = await this.findById(id);

    const rawLinkToken = crypto.randomBytes(32).toString('hex');

    await this.passwordResetRepo.save(
      this.passwordResetRepo.create({
        userId: user.id,
        // No code is ever emailed for this row, so codeHash is set to the
        // hash of a throwaway random value — the column is non-null and
        // nothing a caller could submit can ever match it.
        codeHash: hashToken(crypto.randomBytes(32).toString('hex')),
        // Belt-and-braces: also exhausts the code-attempt budget, so the
        // verify-code path rejects this row outright.
        attempts: 5,
        verifiedTokenHash: hashToken(rawLinkToken),
        expiresAt: new Date(Date.now() + ADMIN_RESET_LINK_TTL_MS),
        usedAt: null,
        adminInitiated: true,
      }),
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/account/set-password?token=${rawLinkToken}`;

    // Email failure must not fail the request — the row is already minted
    // and the admin needs to be told the difference between "sent" and
    // "couldn't send", not get a 500 with no idea what state things are in.
    let emailSent = false;
    try {
      // Reports false (rather than throwing) when the mailer isn't
      // configured — the link row exists either way, so the admin needs to
      // know whether an email is actually on its way.
      emailSent = await this.emailService.sendAdminPasswordResetLink(user.email, resetUrl, user.fullName);
      if (emailSent) {
        this.logger.log(`Admin-issued password reset link sent to ${user.email} (user #${user.id})`);
      } else {
        this.logger.warn(
          `Admin-issued password reset link created for user #${user.id} but not emailed — mailer not configured.`,
        );
      }
    } catch (err) {
      emailSent = false;
      this.logger.warn(
        `Failed to send admin password reset link to ${user.email}: ${err instanceof Error ? err.message : err}`,
      );
    }

    return { success: true, email: user.email, emailSent };
  }

  async updateRole(id: number, role: UserRole) {
    const user = await this.findById(id);
    user.role = role;
    const { passwordHash, ...safeUser } = await this.usersRepo.save(user);
    return safeUser;
  }

  async createStaff(dto: CreateStaffUserDto) {
    const existing = await this.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      phone: dto.phone,
      role: dto.role,
    });
    // Renamed on destructure — `passwordHash` is already bound above in this
    // scope as the value we just hashed.
    const { passwordHash: _hash, ...safeUser } = user;
    return safeUser;
  }
}
