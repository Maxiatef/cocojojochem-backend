import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSetting } from '../../entities';

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

  async update(patch: Record<string, string>) {
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
