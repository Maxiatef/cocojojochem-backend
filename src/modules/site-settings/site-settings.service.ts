import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSetting } from '../../entities';

/**
 * The key holding the store's timezone. One setting, one meaning: every date
 * the site shows or interprets as a wall-clock time is in this zone, wherever
 * the server runs and wherever the person looking at it happens to be.
 *
 * Stored values are unaffected — they are absolute instants (timestamptz).
 * This governs interpretation and display, never storage.
 */
export const TIMEZONE_KEY = 'SITE_TIMEZONE';

const DEFAULT_TIMEZONE = 'America/Los_Angeles';

/** Rejects anything Intl doesn't recognise, so a typo can't silently break every date on the site. */
function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class SiteSettingsService {
  private readonly logger = new Logger('SiteSettings');

  constructor(
    @InjectRepository(SiteSetting)
    private readonly settingsRepo: Repository<SiteSetting>,
  ) {}

  async findAll() {
    const rows = await this.settingsRepo.find({ order: { key: 'ASC' } });
    const flat: Record<string, string | null> = {};
    for (const row of rows) flat[row.key] = row.value;
    return { settings: flat, rows };
  }

  async getValue(key: string): Promise<string | null> {
    const row = await this.settingsRepo.findOne({ where: { key } });
    return row ? row.value : null;
  }

  /**
   * The store timezone, always a usable IANA zone.
   *
   * Falls back rather than throwing: a missing or corrupted row must not take
   * down every page that renders a date.
   */
  async getTimezone(): Promise<string> {
    const stored = await this.getValue(TIMEZONE_KEY);
    if (stored && isValidTimeZone(stored)) return stored;
    return DEFAULT_TIMEZONE;
  }

  async update(patch: Record<string, string>) {
    if (patch[TIMEZONE_KEY] != null && !isValidTimeZone(patch[TIMEZONE_KEY])) {
      throw new BadRequestException(
        `"${patch[TIMEZONE_KEY]}" is not a recognised timezone. Use an IANA name such as America/Los_Angeles.`,
      );
    }

    const keys = Object.keys(patch);
    for (const key of keys) {
      let setting = await this.settingsRepo.findOne({ where: { key } });
      if (!setting) {
        setting = this.settingsRepo.create({ key, value: patch[key] });
      } else {
        setting.value = patch[key];
      }
      await this.settingsRepo.save(setting);
    }
    this.logger.log(`Site settings updated: ${keys.join(', ')}`);
    return this.findAll();
  }
}
