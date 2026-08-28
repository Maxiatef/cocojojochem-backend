import { IsString, MaxLength } from 'class-validator';

export class TrackPageViewDto {
  @IsString()
  @MaxLength(500)
  path: string;

  @IsString()
  @MaxLength(100)
  visitorId: string;
}
