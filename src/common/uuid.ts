/**
 * Shape of the ids this application issues.
 *
 * Postgres raises `invalid input syntax for type uuid` on a malformed value,
 * which surfaces as a 500 rather than a 404. Anywhere an id arrives as free
 * text — a query string, a CSV of ids, webhook metadata — it is checked
 * against this before it reaches a query.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);
