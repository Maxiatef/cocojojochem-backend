import { IsArray, IsUUID } from 'class-validator';

/** Used by the manager-facing roster endpoint, which can only ever set members. */
export class SetTeamMembersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds: string[];
}
