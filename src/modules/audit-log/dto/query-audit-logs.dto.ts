import { IsOptional, IsString } from 'class-validator';

// Same all-optional-strings convention as QueryUsersDto — values are coerced
// in the service rather than by class-transformer, so a bad `page` degrades to
// the default instead of 400-ing.
export class QueryAuditLogsDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  /** Matches summary, entityLabel or actorEmail. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  entityName?: string;

  /** With entityName, this is the "history of one record" query. */
  @IsOptional()
  @IsString()
  entityId?: string;

  /** Comma-separated, same convention as QueryUsersDto.role. */
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  actorType?: string;

  /**
   * The role the actor held AT THE TIME of the action, by name.
   *
   * Distinct from actorType, which is the fixed ADMIN|SALES|SYSTEM vocabulary
   * the table was built with. Roles are user-defined now, so this is the one
   * that answers "what did the Managers do".
   */
  @IsOptional()
  @IsString()
  actorRole?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
