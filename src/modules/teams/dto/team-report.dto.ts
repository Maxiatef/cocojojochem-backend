import { IsOptional, IsString, IsUUID } from 'class-validator';

// All-optional strings, coerced in the service — the same convention as
// QueryUsersDto and QueryAuditLogsDto, so a malformed date degrades to the
// default window rather than 400-ing a dashboard.
export class TeamReportDto {
  /** ISO date. Defaults to 30 days ago. */
  @IsOptional()
  @IsString()
  from?: string;

  /** ISO date. Defaults to now. */
  @IsOptional()
  @IsString()
  to?: string;

  /** Which managed team, when the caller manages more than one. See MyTeamQueryDto. */
  @IsOptional()
  @IsUUID()
  teamId?: string;
}
