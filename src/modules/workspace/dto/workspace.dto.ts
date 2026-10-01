import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsISO8601, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class WorkspaceItemDto {
  @IsString()
  @MaxLength(200)
  slug: string;

  @IsString()
  @MaxLength(300)
  name: string;
}

export class WorkspaceProjectDto {
  @IsString()
  @MaxLength(64)
  id: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(5000)
  notes: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WorkspaceItemDto)
  items: WorkspaceItemDto[];

  @IsISO8601()
  createdAt: string;

  @IsISO8601()
  updatedAt: string;
}

export class SaveCompareDto {
  // Matches COMPARE_LIMIT on the storefront.
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => WorkspaceItemDto)
  items: WorkspaceItemDto[];
}

export class SaveProjectsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkspaceProjectDto)
  projects: WorkspaceProjectDto[];
}

export class MergeWorkspaceDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => WorkspaceItemDto)
  compare?: WorkspaceItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkspaceProjectDto)
  projects?: WorkspaceProjectDto[];
}
