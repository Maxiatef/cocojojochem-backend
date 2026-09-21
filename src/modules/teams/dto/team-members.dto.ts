import { IsArray, IsOptional, IsUUID } from 'class-validator';

/** Used by the manager-facing roster endpoint, which can only ever set members. */
export class SetTeamMembersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds: string[];

  /**
   * Which managed team's roster this replaces. Ignored by the admin route,
   * which takes the team from the path. See MyTeamQueryDto.
   */
  @IsOptional()
  @IsUUID()
  teamId?: string;
}
