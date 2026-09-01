import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ShippingRateTierKind {
  WEIGHT = 'WEIGHT',
  DRUM = 'DRUM',
}

// Admin-editable Zone 1-7 rate table, replacing the old per-state flat
// override (removing that redundancy — editing a zone's rate here now
// changes the cost for every state in that zone at once, since zone
// membership is fixed and only the $ amounts are meant to change).
//
// One row per (kind, zone, breakpoint): WEIGHT rows are keyed by weight in
// lb (1, 2, 4, 6, 10, ... 200), DRUM rows by drum count (1..20) — see
// shipping-rate-tiers.service.ts for the round-up-to-next-breakpoint +
// beyond-table extrapolation lookup logic.
@Entity('shipping_rate_tiers')
@Index(['kind', 'zone', 'breakpoint'], { unique: true })
export class ShippingRateTier {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ShippingRateTierKind })
  kind: ShippingRateTierKind;

  @Column({ type: 'int' })
  zone: number;

  @Column('decimal', { precision: 10, scale: 2 })
  breakpoint: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
