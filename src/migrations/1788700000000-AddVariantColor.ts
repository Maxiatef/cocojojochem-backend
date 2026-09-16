import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional colour description on a product variant.
 *
 * Nullable with no default and no backfill: every existing variant genuinely
 * has no recorded colour, and writing an empty string would make "not entered"
 * indistinguishable from "deliberately blank".
 *
 * varchar(100) rather than text because this is a short label an admin types
 * ("Pale yellow", "Water white"), and the length cap is what stops it being
 * used as a second description field.
 */
export class AddVariantColor1788700000000 implements MigrationInterface {
  name = 'AddVariantColor1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD "color" character varying(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "color"`);
  }
}
