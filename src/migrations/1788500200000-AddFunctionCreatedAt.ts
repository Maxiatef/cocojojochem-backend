import { MigrationInterface, QueryRunner } from 'typeorm';

// `functions` was the one catalog table with no creation timestamp, so the
// admin could not say when a function was added while every neighbouring
// screen could.
//
// Deliberately nullable with no backfill: rows that already exist were created
// at an unknown time, and stamping them with the migration's own timestamp
// would state something false. They render as "—" until replaced. New rows are
// stamped by the DEFAULT, which is what @CreateDateColumn relies on.
export class AddFunctionCreatedAt1788500200000 implements MigrationInterface {
  name = 'AddFunctionCreatedAt1788500200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "functions" ADD COLUMN "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "functions" DROP COLUMN "createdAt"`);
  }
}
