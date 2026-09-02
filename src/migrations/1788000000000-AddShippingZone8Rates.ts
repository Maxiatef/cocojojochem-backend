import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds Zone 8 (Hawaii, American Samoa, Guam, Northern Mariana Islands, and
// Armed Forces Pacific — moved out of Zone 1 per admin instruction) to the
// shipping rate tables. Rates aren't a new admin-provided sheet — the admin
// specified them as a straight multiple of Zone 7's existing rates:
// WEIGHT = 2x Zone 7, DRUM = 6x Zone 7. Values here are that multiplication
// applied to the exact Zone 7 rows already seeded by
// 1787900000000-CreateShippingRateTiers.
export class AddShippingZone8Rates1788000000000 implements MigrationInterface {
  name = 'AddShippingZone8Rates1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "shipping_rate_tiers" ("kind", "zone", "breakpoint", "amount") VALUES
      ('WEIGHT', 8, 1, 34),
      ('WEIGHT', 8, 2, 40),
      ('WEIGHT', 8, 4, 48),
      ('WEIGHT', 8, 6, 56),
      ('WEIGHT', 8, 10, 66),
      ('WEIGHT', 8, 15, 84),
      ('WEIGHT', 8, 20, 100),
      ('WEIGHT', 8, 25, 126),
      ('WEIGHT', 8, 30, 146),
      ('WEIGHT', 8, 35, 162),
      ('WEIGHT', 8, 40, 178),
      ('WEIGHT', 8, 45, 194),
      ('WEIGHT', 8, 50, 208),
      ('WEIGHT', 8, 60, 274),
      ('WEIGHT', 8, 70, 308),
      ('WEIGHT', 8, 80, 354),
      ('WEIGHT', 8, 90, 386),
      ('WEIGHT', 8, 100, 416),
      ('WEIGHT', 8, 110, 440),
      ('WEIGHT', 8, 120, 516),
      ('WEIGHT', 8, 130, 540),
      ('WEIGHT', 8, 140, 594),
      ('WEIGHT', 8, 150, 624),
      ('WEIGHT', 8, 160, 648),
      ('WEIGHT', 8, 170, 722),
      ('WEIGHT', 8, 180, 748),
      ('WEIGHT', 8, 190, 802),
      ('WEIGHT', 8, 200, 832),
      ('DRUM', 8, 1, 2967.0),
      ('DRUM', 8, 2, 3207.3),
      ('DRUM', 8, 3, 3508.8),
      ('DRUM', 8, 4, 4035.12),
      ('DRUM', 8, 5, 5245.68),
      ('DRUM', 8, 6, 6032.52),
      ('DRUM', 8, 7, 6937.38),
      ('DRUM', 8, 8, 7631.1),
      ('DRUM', 8, 9, 9920.46),
      ('DRUM', 8, 10, 11408.52),
      ('DRUM', 8, 11, 13119.78),
      ('DRUM', 8, 12, 14431.8),
      ('DRUM', 8, 13, 18761.34),
      ('DRUM', 8, 14, 21575.52),
      ('DRUM', 8, 15, 24811.86),
      ('DRUM', 8, 16, 27293.04),
      ('DRUM', 8, 17, 35480.94),
      ('DRUM', 8, 18, 40803.06),
      ('DRUM', 8, 19, 46923.54),
      ('DRUM', 8, 20, 51615.9)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "shipping_rate_tiers" WHERE "zone" = 8`);
  }
}
