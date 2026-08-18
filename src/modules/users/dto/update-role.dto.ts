import { IsEnum } from 'class-validator';
import { UserRole } from '../../../entities';

export class UpdateRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
