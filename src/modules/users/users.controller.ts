import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { AdminSetPasswordDto, UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('canViewUsers')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findAllAdmin(@Query() query: QueryUsersDto) {
    return this.usersService.findAllAdmin(query);
  }

  @Post()
  @RequirePermission('canCreateUser')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  createStaff(@Body() dto: CreateStaffUserDto) {
    return this.usersService.createStaff(dto);
  }

  // Declared before ':id' — 'admin' would otherwise be swallowed as an id
  // and rejected by ParseUUIDPipe on that route.
  @Get('admin/stats')
  @RequirePermission('canViewUsers')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  getStats() {
    return this.usersService.getStats();
  }

  // Was guarded only by JwtAuthGuard (no role check) and returned the raw
  // User entity including passwordHash — any logged-in customer could fetch
  // any other user's record, hash included, just by guessing an id. Not
  // called by the frontend at all (dead client-side); locked down and the
  // hash stripped rather than removed outright, in case something external
  // depends on this route existing.
  @Get(':id')
  @RequirePermission('canViewUsers')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const { passwordHash, ...safeUser } = await this.usersService.findById(id);
    return safeUser;
  }

  // Declared before ':id/detail', which would otherwise try to parse the
  // address as a uuid and reject it.
  @Get('by-email/:email/detail')
  @RequirePermission('canViewUsers')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findDetailByEmail(@Param('email') email: string) {
    return this.usersService.findDetailByEmail(email);
  }

  @Get(':id/detail')
  @RequirePermission('canViewUsers')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findDetail(id);
  }

  @Patch(':id/role')
  @RequirePermission('canManageUserRoles')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  updateRole(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    // Self-demotion lockout guard: an admin changing their own role away from
    // the one they hold can strip their own access with no way back in.
    if (req.user.id === id && dto.roleId !== req.user.roleId) {
      throw new BadRequestException('You cannot change your own role.');
    }
    return this.usersService.updateRole(id, dto.roleId);
  }

  @Patch(':id')
  @RequirePermission('canEditUser')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  updateUser(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(id, dto);
  }

  // Sets the password outright without knowing the old one, and signs the
  // user out everywhere as a side effect (see UsersService.setPassword).
  @Patch(':id/password')
  @RequirePermission('canResetUserPassword')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  setPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminSetPasswordDto) {
    return this.usersService.setPassword(id, dto.newPassword);
  }

  // Emails the user a link that lands them straight on the set-password page
  // — no 5-digit code step, unlike the customer-initiated forgot-password
  // flow. The admin never sees the password this way.
  @Post(':id/send-password-reset')
  @RequirePermission('canResetUserPassword')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  sendPasswordReset(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.sendPasswordResetLink(id);
  }

  // Soft delete → Recycle Bin. The safe, reversible action gets the plain
  // DELETE verb; the irreversible one below needs an explicit path segment.
  @Delete(':id')
  @RequirePermission('canDeleteUser')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  softDelete(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.softDelete(id, req.user.id);
  }

  // Declared before ':id/...' siblings for readability; the distinct path
  // segment means order doesn't actually matter here.
  @Delete(':id/permanent')
  @RequirePermission('canDeleteUser')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  purge(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.purge(id);
  }

  @Patch(':id/restore')
  @RequirePermission('canEditUser')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.restore(id);
  }

  // "Log out everywhere" — revokes every live refresh token for the user
  // without touching their password.
  @Post(':id/revoke-sessions')
  @RequirePermission('canResetUserPassword')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  async revokeSessions(@Param('id', ParseUUIDPipe) id: string) {
    await this.usersService.findById(id); // 404s on an unknown id
    const revokedSessions = await this.usersService.revokeAllSessions(id);
    return { success: true, revokedSessions };
  }
}
