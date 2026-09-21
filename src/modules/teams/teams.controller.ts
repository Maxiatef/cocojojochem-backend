import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { QueryAuditLogsDto } from '../audit-log/dto/query-audit-logs.dto';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { SetTeamMembersDto } from './dto/team-members.dto';
import { MyTeamActivityDto, MyTeamQueryDto } from './dto/my-team-query.dto';
import { TeamReportDto } from './dto/team-report.dto';

/**
 * Two audiences, deliberately separated by path rather than by a runtime check
 * inside shared handlers.
 *
 * `/teams/...` is the admin surface: any team, by id, gated on canViewTeams /
 * canManageTeams.
 *
 * `/teams/my-team/...` is the manager surface: gated on canViewOwnTeam /
 * canManageOwnTeam, and it takes **no team id at all**. The team is resolved
 * from `teams.managerId = req.user.id` inside the service, so there is no
 * parameter a manager could change to read someone else's team. That is the
 * whole security model for this feature, and keeping it to one function
 * (TeamsService.resolveManagedTeam) is what makes it checkable.
 */
@ApiTags('Teams')
@ApiBearerAuth('access-token')
@Controller('teams')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  // ---------------------------------------------------------------- shared

  /**
   * Just enough to populate a team picker: id and name.
   *
   * Opened to the user-editing permissions as well as the team ones, for the
   * same reason GET /roles/options exists: the admin user form has a Team
   * dropdown, and someone who may edit a user but not administer teams would
   * otherwise get an empty list with no explanation.
   */
  @Get('options')
  getOptions(@Req() req: any) {
    const p = req.user?.permissions ?? {};
    const allowed =
      p.canViewTeams === true ||
      p.canManageTeams === true ||
      p.canEditUser === true ||
      p.canCreateUser === true;
    if (!allowed) throw new ForbiddenException('Missing permission: canViewTeams');
    return this.teamsService.findOptions();
  }

  // --------------------------------------------------- manager: own team
  // Declared before the ':id' routes — 'my-team' would otherwise be swallowed
  // as an id and rejected by ParseUUIDPipe.

  /**
   * Every team this person manages, for the switcher at the top of the page.
   *
   * Declared before 'my-team' only for readability; the paths do not collide.
   */
  @Get('my-teams')
  @RequirePermission('canViewOwnTeam')
  myTeams(@Req() req: any) {
    return this.teamsService.myTeams(req.user.id);
  }

  /**
   * `teamId` is optional on all four of these and means "which of MY teams".
   * It is not an escape hatch: the service pins every lookup to the caller —
   * by `managerId`, or by the `teamId` on their own user row — so an id from
   * anywhere else 403s. Left out, the caller gets their first team.
   *
   * This route alone also answers for a plain MEMBER of a team, who gets the
   * roster and a `viewerRole` of MEMBER. The other three stay manager-only
   * through resolveManagedTeam: a member does not read their colleagues'
   * activity, does not read the report, and does not edit the roster.
   */
  @Get('my-team')
  @RequirePermission('canViewOwnTeam')
  myTeam(@Req() req: any, @Query() query: MyTeamQueryDto) {
    return this.teamsService.myTeam(req.user.id, query.teamId);
  }

  /** The team's full activity feed — every record type, not just team-owned ones. */
  @Get('my-team/activity')
  @RequirePermission('canViewOwnTeam')
  myTeamActivity(@Req() req: any, @Query() query: MyTeamActivityDto) {
    return this.teamsService.myTeamActivity(req.user.id, query);
  }

  @Get('my-team/report')
  @RequirePermission('canViewOwnTeam')
  myTeamReport(@Req() req: any, @Query() query: TeamReportDto) {
    return this.teamsService.myTeamReport(req.user.id, query);
  }

  /**
   * The one write a manager gets. Note the permission: canManageOwnTeam, not
   * canManageTeams — a manager who has only the view permission can read
   * everything here and change nothing, which is the default the admin picks
   * between.
   */
  @Put('my-team/members')
  @RequirePermission('canManageOwnTeam')
  setOwnMembers(@Req() req: any, @Body() dto: SetTeamMembersDto) {
    return this.teamsService.setOwnTeamMembers(req.user.id, dto.memberIds, dto.teamId);
  }

  // ------------------------------------------------------- admin: any team

  @Get()
  @RequirePermission('canViewTeams')
  findAll() {
    return this.teamsService.findAll();
  }

  /**
   * Staff who can be added to a team, with where they currently sit.
   *
   * Open to canManageOwnTeam as well as canManageTeams: a manager allowed to
   * pick their own members has to be able to see who there is to pick.
   * Deliberately thin — name, email, role and current team, and nothing else
   * about the account.
   */
  @Get('assignable-staff')
  assignableStaff(@Req() req: any) {
    const p = req.user?.permissions ?? {};
    if (p.canManageTeams !== true && p.canManageOwnTeam !== true) {
      throw new ForbiddenException('Missing permission: canManageTeams');
    }
    return this.teamsService.assignableStaff();
  }

  @Post()
  @RequirePermission('canManageTeams')
  create(@Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto);
  }

  @Get(':id')
  @RequirePermission('canViewTeams')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.teamsService.findOne(id);
  }

  @Get(':id/overview')
  @RequirePermission('canViewTeams')
  overview(@Param('id', ParseUUIDPipe) id: string) {
    return this.teamsService.teamOverviewById(id);
  }

  @Get(':id/activity')
  @RequirePermission('canViewTeams')
  activity(@Param('id', ParseUUIDPipe) id: string, @Query() query: QueryAuditLogsDto) {
    return this.teamsService.teamActivity(id, query);
  }

  @Get(':id/report')
  @RequirePermission('canViewTeams')
  report(@Param('id', ParseUUIDPipe) id: string, @Query() query: TeamReportDto) {
    return this.teamsService.teamReport(id, query);
  }

  @Patch(':id')
  @RequirePermission('canManageTeams')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, dto);
  }

  @Put(':id/members')
  @RequirePermission('canManageTeams')
  setMembers(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetTeamMembersDto) {
    return this.teamsService.setMembers(id, dto.memberIds);
  }

  @Delete(':id')
  @RequirePermission('canManageTeams')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.teamsService.delete(id);
  }
}
