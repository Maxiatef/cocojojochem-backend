import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateTeamDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsUUID()
  @IsOptional()
  managerId?: string | null;

  /** Omitted leaves the roster untouched; sent, it replaces it wholesale. */
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  memberIds?: string[];
}
