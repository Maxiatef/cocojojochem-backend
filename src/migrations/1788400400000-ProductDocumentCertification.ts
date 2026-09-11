import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a product document BE one of the product's certifications, rather than
 * only a COA / SDS / TDS / spec sheet.
 *
 * The admin dropdown previously offered document kinds only, which meant a
 * USDA Organic certificate PDF had to be filed as "Other". Now the kind can be
 * CERTIFICATE, with `certificationId` naming which one — and the storefront
 * links that certification's badge straight to the file.
 *
 * `ON DELETE SET NULL`, never CASCADE: removing a certification from the
 * catalogue must not delete the PDF that proves a product once held it. The
 * file survives and simply stops being linked.
 */
export class ProductDocumentCertification1788400400000 implements MigrationInterface {
  name = 'ProductDocumentCertification1788400400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres 12+ allows ADD VALUE inside a transaction as long as the new
    // value isn't *used* in the same transaction — nothing below writes a row.
    await queryRunner.query(
      `ALTER TYPE "public"."product_documents_type_enum" ADD VALUE IF NOT EXISTS 'CERTIFICATE'`,
    );

    await queryRunner.query(`ALTER TABLE "product_documents" ADD COLUMN "certificationId" INTEGER`);
    await queryRunner.query(
      `ALTER TABLE "product_documents"
         ADD CONSTRAINT "FK_product_documents_certification"
         FOREIGN KEY ("certificationId") REFERENCES "certifications"("id")
         ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // Partial: only certificate rows carry a value, and they're the minority.
    await queryRunner.query(
      `CREATE INDEX "IDX_product_documents_certification" ON "product_documents" ("certificationId") WHERE "certificationId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_product_documents_certification"`);
    await queryRunner.query(
      `ALTER TABLE "product_documents" DROP CONSTRAINT IF EXISTS "FK_product_documents_certification"`,
    );
    await queryRunner.query(`ALTER TABLE "product_documents" DROP COLUMN IF EXISTS "certificationId"`);
    // The enum value is deliberately left in place. Removing a value from a
    // Postgres enum means recreating the type and rewriting every dependent
    // column, and an unused label is harmless — any CERTIFICATE rows are
    // rewritten to OTHER first so nothing dangles.
    await queryRunner.query(
      `UPDATE "product_documents" SET "type" = 'OTHER' WHERE "type" = 'CERTIFICATE'`,
    );
  }
}
