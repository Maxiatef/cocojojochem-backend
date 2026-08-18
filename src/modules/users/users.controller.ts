import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllAdmin(@Query() query: QueryUsersDto) {
    return this.usersService.findAllAdmin(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createStaff(@Body() dto: CreateStaffUserDto) {
    return this.usersService.createStaff(dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findById(id);
  }

  @Get(':id/detail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findDetail(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findDetail(id);
  }

  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateRole(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.usersService.updateRole(id, dto.role);
  }
}
