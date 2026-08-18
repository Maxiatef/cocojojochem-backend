import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSeoAnalyzer1786650900000 implements MigrationInterface {
  name = 'CreateSeoAnalyzer1786650900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."seo_issues_issuetype_enum" AS ENUM('MISSING_TITLE','MISSING_META_DESCRIPTION','MISSING_H1','MULTIPLE_H1','THIN_CONTENT','MISSING_ALT_TEXT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."seo_issues_severity_enum" AS ENUM('CRITICAL','HIGH','MEDIUM','LOW')`,
    );
    await queryRunner.query(
      `CREATE TABLE "seo_metrics" ( "id" SERIAL NOT NULL, "path" character varying NOT NULL, "title" character varying, "metaDescription" text, "h1Tag" character varying, "wordCount" integer, "internalLinks" integer NOT NULL DEFAULT 0, "externalLinks" integer NOT NULL DEFAULT 0, "imageCount" integer NOT NULL DEFAULT 0, "imagesWithAltText" integer NOT NULL DEFAULT 0, "pageLoadTimeMs" integer, "seoScore" integer, "lastAnalyzed" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_seo_metrics_path" UNIQUE ("path"), CONSTRAINT "PK_seo_metrics_id" PRIMARY KEY ("id") )`,
    );
    await queryRunner.query(
      `CREATE TABLE "seo_issues" ( "id" SERIAL NOT NULL, "path" character varying NOT NULL, "issueType" "public"."seo_issues_issuetype_enum" NOT NULL, "severity" "public"."seo_issues_severity_enum" NOT NULL, "description" text NOT NULL, "isFixed" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_seo_issues_id" PRIMARY KEY ("id") )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "seo_issues"`);
    await queryRunner.query(`DROP TABLE "seo_metrics"`);
    await queryRunner.query(`DROP TYPE "public"."seo_issues_severity_enum"`);
    await queryRunner.query(`DROP TYPE "public"."seo_issues_issuetype_enum"`);
  }
}
