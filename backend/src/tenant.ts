/**
 * Multi-tenant identifiers.
 *
 * Every app record belongs to exactly one workspace ("profile"). The profile id
 * is embedded in the Appwrite entity id (`profileId:entityId`) so records from
 * two workspaces can never share a row, even if they use the same student or
 * receipt number.
 */

/** The fixed super-admin account. These credentials are intentionally fixed. */
export const SUPER_ADMIN_EMAIL =
  process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || 'developer@myenum.in';
export const SUPER_ADMIN_PASSWORD =
  process.env.SUPER_ADMIN_PASSWORD || '@Meenu2412';
export const SUPER_ADMIN_NAME = 'Org Menu';

/** Profile id owned by the fixed super admin. */
export const SUPER_PROFILE_ID = 'orgmenu';

/** Public base used to build each workspace's payment link. */
export const PAYMENT_BASE_URL = 'https://myfees.myenum.in';

/** Profile ids become a URL path segment, so keep them path-safe. */
const PROFILE_ID_RE = /^[a-z0-9][a-z0-9_-]{1,47}$/i;

export function isValidProfileId(value: unknown): value is string {
  return typeof value === 'string' && PROFILE_ID_RE.test(value.trim());
}

export function normalizeProfileId(value: string): string {
  return value.trim();
}

export function paymentUrlFor(profileId: string): string {
  return `${PAYMENT_BASE_URL}/${encodeURIComponent(profileId)}`;
}

export function profilePrefix(profileId: string): string {
  return `${profileId}:`;
}

/** Entity id as stored in Appwrite for a profile-scoped record. */
export function scopedEntityId(profileId: string, entityId: string): string {
  return `${profileId}:${entityId}`;
}

/** Strip a known profile prefix from a stored entity id. */
export function unscopedEntityId(profileId: string, entityId: string): string {
  const prefix = profilePrefix(profileId);
  return entityId.startsWith(prefix)
    ? entityId.slice(prefix.length)
    : entityId;
}
