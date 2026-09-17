import { IsUUID } from 'class-validator';

export class UpdateRoleDto {
  @IsUUID('4')
  roleId: string;
}
