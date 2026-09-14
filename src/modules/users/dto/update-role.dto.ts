import { IsInt } from 'class-validator';

export class UpdateRoleDto {
  @IsInt()
  roleId: number;
}
