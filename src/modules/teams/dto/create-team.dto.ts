import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  /** Null creates a team with no manager yet — valid, and sometimes the order things happen in. */
  @IsInt()
  @IsOptional()
  managerId?: number | null;

  /**
   * Optional starting roster. Sent as the complete member list, not a delta —
   * see TeamsService.setMembers for why replacing is the right shape here.
   */
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  memberIds?: number[];
}
