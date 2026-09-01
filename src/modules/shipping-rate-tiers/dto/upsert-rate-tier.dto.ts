import { Min } from 'class-validator';

export class UpsertRateTierDto {
  @Min(0)
  amount: number;
}
