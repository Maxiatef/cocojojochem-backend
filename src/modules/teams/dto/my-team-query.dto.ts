import { IsOptional, IsUUID } from 'class-validator';
import { QueryAuditLogsDto } from '../../audit-log/dto/query-audit-logs.dto';

/**
 * The optional team selector shared by every `/teams/my-team/*` route.
 *
 * A manager may now be over several teams, so these routes need to know which
 * one is being looked at. It stays OPTIONAL and it is never trusted on its
 * own: TeamsService.resolveManagedTeam always adds `managerId = <the caller>`
 * to the lookup, so an id belonging to someone else's team resolves to nothing
 * and 403s. Omitting it keeps the original behaviour — the caller's first team
 * by name — which is what a manager with exactly one team always gets.
 *
 * `@IsUUID()` rather than a plain string: a non-uuid would otherwise reach the
 * query as a `uuid = $1` comparison and fail as a Postgres cast error (500)
 * instead of a 400.
 */
export class MyTeamQueryDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

/**
 * The activity feed's filters plus the team selector.
 *
 * Extends rather than edits QueryAuditLogsDto, which the admin /audit-logs
 * routes also use — `teamId` means nothing there, and `forbidNonWhitelisted`
 * would reject it anyway.
 */
export class MyTeamActivityDto extends QueryAuditLogsDto {
  @IsOptional()
  @IsUUID()
  teamId?: string;
}
