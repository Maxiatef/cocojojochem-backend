import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRolesTable1788500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR UNIQUE NOT NULL,
        "description" TEXT,
        "permissions" JSONB DEFAULT '{}',
        "isSystem" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMPTZ DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_roles_name" ON "roles" ("name")`);

    await queryRunner.query(`
      INSERT INTO "roles" ("name", "description", "isSystem", "permissions") VALUES
      ('Admin', 'Full access', true, '{"canViewProducts": true, "canCreateProduct": true, "canEditProduct": true, "canDeleteProduct": true, "canViewCategories": true, "canCreateCategory": true, "canEditCategory": true, "canDeleteCategory": true, "canViewOrders": true, "canEditOrderStatus": true, "canEditOrderTracking": true, "canViewCoupons": true, "canCreateCoupon": true, "canEditCoupon": true, "canDeleteCoupon": true, "canViewBulkSales": true, "canCreateBulkSale": true, "canEditBulkSale": true, "canDeleteBulkSale": true, "canViewUsers": true, "canCreateUser": true, "canEditUser": true, "canDeleteUser": true, "canManageUserRoles": true, "canResetUserPassword": true, "canViewRoles": true, "canManageRoles": true, "canViewCompanies": true, "canEditCompany": true, "canViewQuoteRequests": true, "canEditQuoteRequest": true, "canViewContactMessages": true, "canEditContactMessage": true, "canDeleteContactMessage": true, "canCreateCertification": true, "canViewFunctions": true, "canCreateFunction": true, "canEditFunction": true, "canDeleteFunction": true, "canCreateTestimonial": true, "canViewShippingRates": true, "canEditShippingRates": true, "canViewSeoPages": true, "canCreateSeoPage": true, "canEditSeoPage": true, "canDeleteSeoPage": true, "canRunSeoAnalyzer": true, "canViewSiteSettings": true, "canEditSiteSettings": true, "canUploadMedia": true, "canViewDashboard": true, "canViewAnalytics": true, "canViewAuditLog": true}'),
      ('Sales', 'Sales desk — read access plus order and enquiry handling', true, '{"canViewProducts": true, "canViewCategories": true, "canViewOrders": true, "canViewCoupons": true, "canViewBulkSales": true, "canViewCompanies": true, "canViewQuoteRequests": true, "canViewContactMessages": true, "canViewFunctions": true, "canViewShippingRates": true, "canViewDashboard": true, "canViewAnalytics": true, "canEditContactMessage": true, "canEditOrderStatus": true, "canEditOrderTracking": true, "canEditQuoteRequest": true}')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "roles"`);
  }
}
