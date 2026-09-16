import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateTeamDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string | null;

  @IsInt()
  @IsOptional()
  managerId?: number | null;

  /** Omitted leaves the roster untouched; sent, it replaces it wholesale. */
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  memberIds?: number[];
}
