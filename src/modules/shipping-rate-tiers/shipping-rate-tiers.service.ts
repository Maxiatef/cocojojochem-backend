import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShippingRateTier, ShippingRateTierKind } from '../../entities';

export const MIN_ZONE = 1;
export const MAX_ZONE = 8;

@Injectable()
export class ShippingRateTiersService {
  private readonly logger = new Logger('ShippingRateTiers');

  constructor(
    @InjectRepository(ShippingRateTier)
    private readonly repo: Repository<ShippingRateTier>,
  ) {}

  // All rows for one table (WEIGHT or DRUM), reshaped into one row per
  // breakpoint with an 8-wide `rates` array (index 0 = Zone 1) — the shape
  // the admin rate-table UI renders directly.
  async findGrouped(kind: ShippingRateTierKind) {
    const rows = await this.repo.find({ where: { kind }, order: { breakpoint: 'ASC', zone: 'ASC' } });
    const byBreakpoint = new Map<string, (number | null)[]>();
    for (const row of rows) {
      const key = row.breakpoint;
      if (!byBreakpoint.has(key)) byBreakpoint.set(key, new Array(MAX_ZONE).fill(null));
      byBreakpoint.get(key)![row.zone - 1] = Number(row.amount);
    }
    return Array.from(byBreakpoint.entries())
      .map(([breakpoint, rates]) => ({ breakpoint: Number(breakpoint), rates }))
      .sort((a, b) => a.breakpoint - b.breakpoint);
  }

  async upsert(kind: ShippingRateTierKind, zone: number, breakpoint: number, amount: number) {
    if (zone < MIN_ZONE || zone > MAX_ZONE) {
      throw new NotFoundException(`Zone must be between ${MIN_ZONE} and ${MAX_ZONE}`);
    }
    const existing = await this.repo.findOne({
      where: { kind, zone, breakpoint: breakpoint.toFixed(2) },
    });
    if (existing) {
      existing.amount = amount.toFixed(2);
      const saved = await this.repo.save(existing);
      this.logger.log(`Rate tier updated: ${kind} zone=${zone} breakpoint=${breakpoint} -> $${amount}`);
      return saved;
    }
    const created = this.repo.create({
      kind,
      zone,
      breakpoint: breakpoint.toFixed(2),
      amount: amount.toFixed(2),
    });
    const saved = await this.repo.save(created);
    this.logger.log(`Rate tier created: ${kind} zone=${zone} breakpoint=${breakpoint} -> $${amount}`);
    return saved;
  }

  // Lookup used by OrdersService.getShippingEstimate: round UP to the next
  // stored breakpoint for this zone; beyond the highest stored breakpoint,
  // extrapolate linearly using the per-unit rate implied by the last
  // segment. Returns null if this zone has no rows at all (never
  // fabricates a rate) — caller should fall back to the flat default.
  async getRate(kind: ShippingRateTierKind, zone: number, value: number): Promise<number | null> {
    if (zone < MIN_ZONE || zone > MAX_ZONE) return null;
    const rows = await this.repo.find({ where: { kind, zone }, order: { breakpoint: 'ASC' } });
    if (rows.length === 0) return null;

    const clamped = Math.max(value, 0);
    const last = rows[rows.length - 1];
    const lastBreakpoint = Number(last.breakpoint);

    if (clamped > lastBreakpoint) {
      if (rows.length === 1) return Number(last.amount);
      const prev = rows[rows.length - 2];
      const prevBreakpoint = Number(prev.breakpoint);
      const prevAmount = Number(prev.amount);
      const lastAmount = Number(last.amount);
      const perUnit = (lastAmount - prevAmount) / (lastBreakpoint - prevBreakpoint);
      return lastAmount + perUnit * (clamped - lastBreakpoint);
    }

    const row = rows.find((r) => Number(r.breakpoint) >= clamped);
    return Number((row ?? last).amount);
  }
}
