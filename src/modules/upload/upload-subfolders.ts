// Which folder each upload route writes into.
//
// Derived from the request URL, never from the request body. The body used to
// carry a `subfolder` field that was passed straight into
// join('./uploads', …) — arbitrary file write for any caller. It was also
// unreliable: multer's `destination` callback runs while the multipart stream
// is still being parsed, so `req.body.subfolder` was usually still undefined
// and the fallback won anyway. The frontend never sent it either
// (see uploads.ts), so it was untrusted input that only ever produced bugs.
export const UPLOAD_SUBFOLDERS = [
  'products',
  'variants',
  'categories',
  'gallery',
  'documents',
  'temp',
] as const;

export type UploadSubfolder = (typeof UPLOAD_SUBFOLDERS)[number];

// Single source of truth, shared by multer's destination and the controller's
// URL generation so the stored URL always matches where the file landed.
export const UPLOAD_SUBFOLDER_BY_ROUTE = {
  productImage: 'products',
  variantImage: 'variants',
  categoryImage: 'categories',
  multipleImages: 'gallery',
  productDocument: 'documents',
} as const satisfies Record<string, UploadSubfolder>;

export function subfolderForRequestUrl(url: string): UploadSubfolder {
  if (url.includes('/product-image')) return 'products';
  if (url.includes('/variant-image')) return 'variants';
  if (url.includes('/category-image')) return 'categories';
  if (url.includes('/multiple-images')) return 'gallery';
  if (url.includes('/product-document')) return 'documents';
  return 'temp';
}

export function isUploadSubfolder(value: unknown): value is UploadSubfolder {
  return typeof value === 'string' && (UPLOAD_SUBFOLDERS as readonly string[]).includes(value);
}
