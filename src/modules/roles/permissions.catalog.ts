/**
 * The single source of truth for what a role can be granted.
 *
 * Every `@RequirePermission('...')` in a controller must appear here, or it
 * would be a route nobody can ever be granted access to.
 *
 * The reverse does not quite hold: `canViewCategories` and `canViewFunctions`
 * gate admin sidebar entries whose list endpoints are public GETs, so they
 * have no `@RequirePermission` of their own. Everything else here backs at
 * least one route — a key with neither is a checkbox that does nothing.
 *
 * Grouped rather than flat because the admin role editor renders these as
 * labelled sections; the API exposes both shapes.
 */
export interface PermissionDef {
  key: string;
  label: string;
}

export interface PermissionGroup {
  group: string;
  permissions: PermissionDef[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: 'Products',
    permissions: [
      { key: 'canViewProducts', label: 'View products' },
      { key: 'canCreateProduct', label: 'Create products' },
      { key: 'canEditProduct', label: 'Edit products' },
      { key: 'canDeleteProduct', label: 'Delete products' },
    ],
  },
  {
    group: 'Categories',
    permissions: [
      { key: 'canViewCategories', label: 'View categories' },
      { key: 'canCreateCategory', label: 'Create categories' },
      { key: 'canEditCategory', label: 'Edit categories' },
      { key: 'canDeleteCategory', label: 'Delete categories' },
    ],
  },
  {
    group: 'Orders',
    permissions: [
      { key: 'canViewOrders', label: 'View orders' },
      { key: 'canEditOrderStatus', label: 'Change order status' },
      { key: 'canEditOrderTracking', label: 'Edit order tracking' },
      { key: 'canCancelOrder', label: 'Cancel orders' },
    ],
  },
  {
    group: 'Coupons',
    permissions: [
      { key: 'canViewCoupons', label: 'View coupons' },
      { key: 'canCreateCoupon', label: 'Create coupons' },
      { key: 'canEditCoupon', label: 'Edit coupons' },
      { key: 'canDeleteCoupon', label: 'Delete coupons' },
    ],
  },
  {
    group: 'Bulk sales',
    permissions: [
      { key: 'canViewBulkSales', label: 'View bulk sales' },
      { key: 'canCreateBulkSale', label: 'Create bulk sales' },
      { key: 'canEditBulkSale', label: 'Edit bulk sales' },
      { key: 'canDeleteBulkSale', label: 'Delete bulk sales' },
    ],
  },
  {
    group: 'Users',
    permissions: [
      { key: 'canViewUsers', label: 'View users' },
      { key: 'canCreateUser', label: 'Create staff users' },
      { key: 'canEditUser', label: 'Edit users' },
      { key: 'canDeleteUser', label: 'Delete users' },
      { key: 'canManageUserRoles', label: 'Assign roles to users' },
      { key: 'canResetUserPassword', label: 'Reset passwords & revoke sessions' },
    ],
  },
  {
    group: 'Roles',
    permissions: [
      { key: 'canViewRoles', label: 'View roles' },
      { key: 'canManageRoles', label: 'Create, edit & delete roles' },
    ],
  },
  {
    group: 'Companies',
    permissions: [
      { key: 'canViewCompanies', label: 'View companies' },
      { key: 'canEditCompany', label: 'Edit companies' },
    ],
  },
  {
    group: 'Quote requests',
    permissions: [
      { key: 'canViewQuoteRequests', label: 'View quote requests' },
      { key: 'canEditQuoteRequest', label: 'Update quote request status' },
    ],
  },
  {
    group: 'Contact messages',
    permissions: [
      { key: 'canViewContactMessages', label: 'View contact messages' },
      { key: 'canEditContactMessage', label: 'Update contact messages' },
      { key: 'canDeleteContactMessage', label: 'Delete contact messages' },
    ],
  },
  {
    group: 'Catalog metadata',
    permissions: [
      { key: 'canCreateCertification', label: 'Create certifications' },
      { key: 'canViewFunctions', label: 'View functions' },
      { key: 'canCreateFunction', label: 'Create functions' },
      { key: 'canEditFunction', label: 'Edit functions' },
      { key: 'canDeleteFunction', label: 'Delete functions' },
      { key: 'canViewTestimonials', label: 'View testimonials' },
      { key: 'canCreateTestimonial', label: 'Create testimonials' },
      { key: 'canEditTestimonial', label: 'Edit testimonials' },
      { key: 'canDeleteTestimonial', label: 'Delete testimonials' },
    ],
  },
  {
    group: 'Shipping',
    permissions: [
      { key: 'canViewShippingRates', label: 'View shipping rates' },
      { key: 'canEditShippingRates', label: 'Edit shipping rates' },
    ],
  },
  {
    group: 'SEO',
    permissions: [
      { key: 'canViewSeoPages', label: 'View SEO pages' },
      { key: 'canCreateSeoPage', label: 'Create SEO pages' },
      { key: 'canEditSeoPage', label: 'Edit SEO pages' },
      { key: 'canDeleteSeoPage', label: 'Delete SEO pages' },
      { key: 'canRunSeoAnalyzer', label: 'Run the SEO analyzer' },
    ],
  },
  {
    group: 'Site',
    permissions: [
      { key: 'canViewSiteSettings', label: 'View site settings' },
      { key: 'canEditSiteSettings', label: 'Edit site settings' },
      { key: 'canUploadMedia', label: 'Upload images & documents' },
    ],
  },
  {
    group: 'Insights',
    permissions: [
      { key: 'canViewDashboard', label: 'View the dashboard' },
      { key: 'canViewAnalytics', label: 'View analytics' },
      { key: 'canViewAuditLog', label: 'View the audit log' },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);
