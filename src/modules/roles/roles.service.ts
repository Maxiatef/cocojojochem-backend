import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../../entities/Role';
import { User } from '../../entities/User';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, PermissionGroup } from './permissions.catalog';

@Injectable()
export class RolesService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Roles');
  constructor(
    @InjectRepository(Role)
    private rolesRepo: Repository<Role>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  /**
   * Reconciles stored roles with the permission catalog on every boot.
   *
   * Without this, adding a permission to the catalog silently locks everyone
   * out of whatever it guards: the seed migration has already run and will
   * never run again, so no stored role would carry the new key and the guard
   * would deny every request. That is exactly what happened when the catalog
   * grew after the first deploy — Roles, SEO and Settings vanished from the
   * admin sidebar with nothing in the logs to say why.
   *
   * The system "Admin" role is defined as full access, so it is granted every
   * key. Every other role only gains the key set to `false`, which changes
   * nothing about what it can do and leaves the checkbox visible in the editor.
   */
  async onApplicationBootstrap(): Promise<void> {
    let roles: Role[];
    try {
      roles = await this.rolesRepo.find();
    } catch (err) {
      // A missing table on first boot (migrations not yet applied) must not
      // stop the app from starting.
      this.logger.warn(
        `Skipped permission sync: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }

    for (const role of roles) {
      const current = role.permissions ?? {};
      const isFullAccess = role.isSystem && role.name === 'Admin';
      const next: Record<string, boolean> = {};
      const added: string[] = [];

      for (const key of ALL_PERMISSIONS) {
        if (isFullAccess) {
          next[key] = true;
          if (current[key] !== true) added.push(key);
        } else {
          next[key] = current[key] === true;
          if (!(key in current)) added.push(key);
        }
      }

      if (added.length === 0) continue;
      role.permissions = next;
      await this.rolesRepo.save(role);
      this.logger.log(
        `Synced role "${role.name}": ${added.length} permission(s) added${
          isFullAccess ? ' (granted)' : ' (denied by default)'
        } — ${added.join(', ')}`,
      );
    }
  }

  /**
   * Keeps only keys that exist in the catalog, and coerces values to real
   * booleans. Without this, a client could persist arbitrary JSON into the
   * permissions column — junk keys that no guard reads, or string values like
   * `"false"` which are truthy and would silently grant access.
   */
  private sanitizePermissions(input: Record<string, unknown>): Record<string, boolean> {
    const clean: Record<string, boolean> = {};
    for (const key of ALL_PERMISSIONS) {
      clean[key] = input?.[key] === true;
    }
    return clean;
  }

  async create(dto: CreateRoleDto): Promise<Role> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Role name is required');

    const existing = await this.rolesRepo.findOne({ where: { name } });
    if (existing) throw new BadRequestException('Role name already exists');

    const role = this.rolesRepo.create({
      name,
      description: dto.description?.trim() || null,
      permissions: this.sanitizePermissions(dto.permissions),
      isSystem: false,
    });
    return this.rolesRepo.save(role);
  }

  async findAll(): Promise<(Role & { userCount: number })[]> {
    const roles = await this.rolesRepo.find({ order: { id: 'ASC' } });
    // One grouped count rather than a query per role.
    const counts = await this.usersRepo
      .createQueryBuilder('user')
      .select('user.roleId', 'roleId')
      .addSelect('COUNT(*)', 'count')
      .where('user.roleId IS NOT NULL')
      .groupBy('user.roleId')
      .getRawMany<{ roleId: number; count: string }>();

    const byRole = new Map(counts.map((c) => [Number(c.roleId), Number(c.count)]));
    return roles.map((r) => Object.assign(r, { userCount: byRole.get(r.id) ?? 0 }));
  }

  async findOne(id: number): Promise<Role> {
    const role = await this.rolesRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async update(id: number, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Role name is required');
      if (role.isSystem && name !== role.name) {
        throw new BadRequestException('Cannot rename system roles');
      }
      if (name !== role.name) {
        const clash = await this.rolesRepo.findOne({ where: { name } });
        if (clash) throw new BadRequestException('Role name already exists');
      }
      role.name = name;
    }

    if (dto.description !== undefined) {
      role.description = dto.description?.trim() || null;
    }

    if (dto.permissions !== undefined) {
      const next = this.sanitizePermissions(dto.permissions);
      // A system role that loses role management locks every admin out of the
      // roles screen permanently — there is no other way back in.
      if (role.isSystem && role.permissions?.canManageRoles === true && !next.canManageRoles) {
        throw new BadRequestException(
          'Cannot remove role management from a system role — you would lock yourself out.',
        );
      }
      role.permissions = next;
    }

    return this.rolesRepo.save(role);
  }

  async delete(id: number): Promise<void> {
    const role = await this.findOne(id);
    if (role.isSystem) throw new BadRequestException('Cannot delete system roles');

    const usersCount = await this.usersRepo.count({ where: { roleId: id } });
    if (usersCount > 0) {
      throw new BadRequestException(
        `Cannot delete a role that is still assigned to ${usersCount} user(s). Reassign them first.`,
      );
    }

    await this.rolesRepo.delete(id);
  }

  /** A permission is granted only on a strict `true` — absent means denied. */
  async hasPermission(roleId: number | null, permission: string): Promise<boolean> {
    if (!roleId) return false;
    const role = await this.rolesRepo.findOne({ where: { id: roleId } });
    return role?.permissions?.[permission] === true;
  }

  getAllPermissions(): string[] {
    return ALL_PERMISSIONS;
  }

  getPermissionGroups(): PermissionGroup[] {
    return PERMISSION_GROUPS;
  }
}
