import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ForbiddenException,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('Roles')
@ApiBearerAuth('access-token')
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission('canViewRoles')
  findAll() {
    return this.rolesService.findAll();
  }

  /**
   * Just enough to populate a role picker: id, name, isSystem — no permission
   * matrix, no user counts.
   *
   * Assigning a role and auditing what roles can do are different jobs with
   * different permissions, but the assign screens all need the list of roles.
   * Without this, canManageUserRoles on its own produced an empty dropdown,
   * because the full list is canViewRoles.
   *
   * Either permission opens it, checked in the handler because @RequirePermission
   * takes one key. Deliberately thin: someone who may only assign roles has no
   * business reading every role's full permission set.
   */
  @Get('options')
  getOptions(@Req() req: any) {
    const permissions = req.user?.permissions ?? {};
    if (permissions.canManageUserRoles !== true && permissions.canViewRoles !== true) {
      throw new ForbiddenException('Missing permission: canManageUserRoles');
    }
    return this.rolesService.findOptions();
  }

  // Declared before ':id' — 'permissions' would otherwise be swallowed by the
  // param route and rejected by ParseIntPipe.
  @Get('permissions/all')
  @RequirePermission('canViewRoles')
  getAllPermissions() {
    return this.rolesService.getAllPermissions();
  }

  // Grouped + labelled, for the checkbox sections in the role editor.
  @Get('permissions/groups')
  @RequirePermission('canViewRoles')
  getPermissionGroups() {
    return this.rolesService.getPermissionGroups();
  }

  @Get(':id')
  @RequirePermission('canViewRoles')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermission('canManageRoles')
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('canManageRoles')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('canManageRoles')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.delete(id);
  }
}
