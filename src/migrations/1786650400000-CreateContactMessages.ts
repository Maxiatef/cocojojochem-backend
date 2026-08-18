import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContactMessages1786650400000 implements MigrationInterface {
  name = 'CreateContactMessages1786650400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."contact_messages_status_enum" AS ENUM('UNREAD', 'READ', 'ARCHIVED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "contact_messages" (
        "id" SERIAL NOT NULL,
        "fullName" character varying NOT NULL,
        "email" character varying NOT NULL,
        "phone" character varying,
        "subject" character varying NOT NULL,
        "message" text NOT NULL,
        "status" "public"."contact_messages_status_enum" NOT NULL DEFAULT 'UNREAD',
        "repliedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contact_messages_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "contact_messages"`);
    await queryRunner.query(`DROP TYPE "public"."contact_messages_status_enum"`);
  }
}
