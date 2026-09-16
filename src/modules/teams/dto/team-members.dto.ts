import { IsArray, IsInt } from 'class-validator';

/** Used by the manager-facing roster endpoint, which can only ever set members. */
export class SetTeamMembersDto {
  @IsArray()
  @IsInt({ each: true })
  memberIds: number[];
}
