import { randomBytes } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

import {
  APPWRITE_COLLECTIONS,
  deleteRecord,
  getRecord,
  listRecords,
  listScopedRecords,
  putRecord,
} from './db.js';
import {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_NAME,
  SUPER_ADMIN_PASSWORD,
  SUPER_PROFILE_ID,
  isValidProfileId,
  paymentUrlFor,
  scopedEntityId,
  slugifyCompanyName,
} from './tenant.js';
import {
  createUser,
  displayName,
  findUserByEmail,
  hashPassword,
  invalidateUserCache,
  isSuperUser,
  listUsers,
  normalizeEmail,
  removeUser,
  saveUser,
  verifyPassword,
  type UserRecord,
} from './users.js';

/**
 * A workspace ("profile"). The profile id is both the Appwrite row id and the
 * path segment used for the public payment link.
 */
export interface ProfileRecord {
  profileId: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  paymentUrl: string;
  createdAt: string;
  updatedAt: string;
}

const PROFILES = APPWRITE_COLLECTIONS.profiles;

export const DEFAULT_DROPDOWNS: Record<string, string[]> = {
  gender: ['Male', 'Female', 'Other'],
  classGroup: ['Class 1', 'Class 2', 'Class 3', 'Group A', 'Group B'],
  course: ['Science', 'Commerce', 'Arts', 'General'],
  studentStatus: ['Active', 'Inactive'],
  feeFrequency: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-Time'],
  feeType: [
    'Tuition Fee',
    'Admission Fee',
    'Exam Fee',
    'Transport Fee',
    'Library Fee',
    'Hostel Fee',
    'Other',
  ],
  paymentMethod: ['Cash', 'UPI', 'Bank Transfer'],
  receiptStatus: ['Paid', 'Pending', 'Cancelled'],
};

const SCOPED_TABLES = [
  APPWRITE_COLLECTIONS.fees,
  APPWRITE_COLLECTIONS.students,
  APPWRITE_COLLECTIONS.studentGroups,
  APPWRITE_COLLECTIONS.feeStructures,
  APPWRITE_COLLECTIONS.receipts,
  APPWRITE_COLLECTIONS.announcements,
  APPWRITE_COLLECTIONS.dropdownOptions,
  APPWRITE_COLLECTIONS.paymentOrders,
  APPWRITE_COLLECTIONS.paymentEvents,
  APPWRITE_COLLECTIONS.paymentSettings,
  APPWRITE_COLLECTIONS.businessProfiles,
] as const;

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function nowIso(): string {
  return new Date().toISOString();
}

function randomSuffix(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function normalizeProfile(profile: ProfileRecord): ProfileRecord {
  return {
    ...profile,
    paymentUrl: paymentUrlFor(profile.profileId, profile.name),
  };
}

export async function getProfile(
  profileId: string
): Promise<ProfileRecord | null> {
  const record = await getRecord<ProfileRecord>(
    PROFILES,
    profileId.trim()
  );
  return record ? normalizeProfile(record.data) : null;
}

export async function listProfiles(): Promise<ProfileRecord[]> {
  const rows = await listRecords<ProfileRecord>(PROFILES);
  return rows
    .map((row) => normalizeProfile(row.data))
    .sort((a, b) =>
      String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
    );
}

export async function findProfileBySlug(
  slug: string
): Promise<ProfileRecord | null> {
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;

  const direct = await getProfile(slug.trim());
  if (direct) return direct;

  const profiles = await listProfiles();
  const matched = profiles.filter((p) => {
    return (
      p.profileId.toLowerCase() === clean ||
      slugifyCompanyName(p.name) === clean ||
      p.name.trim().toLowerCase() === clean
    );
  });

  if (matched.length === 0) return null;
  if (matched.length === 1) return matched[0];

  // If multiple profiles match, prefer profiles tied to an active user
  const users = await listUsers().catch(() => []);
  const activeProfileIds = new Set(users.map((u) => u.profile_id));

  const userMatched = matched.filter((p) => activeProfileIds.has(p.profileId));
  if (userMatched.length > 0) {
    return userMatched.sort((a, b) =>
      String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
    )[0];
  }

  return matched.sort((a, b) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
  )[0];
}

async function createProfile(input: {
  profileId: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
}): Promise<ProfileRecord> {
  const profileId = input.profileId.trim();
  if (!isValidProfileId(profileId)) {
    throw Object.assign(new Error('Invalid profile id.'), { statusCode: 400 });
  }
  const existing = await getProfile(profileId);
  if (existing) {
    throw Object.assign(new Error('That profile id already exists.'), {
      statusCode: 409,
    });
  }

  const now = nowIso();
  const profile: ProfileRecord = {
    profileId,
    name: input.name.trim() || profileId,
    ownerName: input.ownerName.trim(),
    ownerEmail: normalizeEmail(input.ownerEmail),
    paymentUrl: paymentUrlFor(profileId, input.name),
    createdAt: now,
    updatedAt: now,
  };
  await putRecord(PROFILES, profileId, profile);
  return profile;
}

async function ensureProfileRecord(
  profileId: string,
  input: { name: string; ownerName: string; ownerEmail: string }
): Promise<ProfileRecord> {
  const existing = await getProfile(profileId);
  if (existing) return existing;
  return createProfile({ profileId, ...input });
}

async function generateProfileId(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = `ORG-${randomSuffix()}`;
    if (!(await getProfile(candidate))) return candidate;
  }
  throw Object.assign(
    new Error('Could not allocate a unique profile id. Please try again.'),
    { statusCode: 503 }
  );
}

async function uniqueProfileId(base: string): Promise<string> {
  let root = slugify(base) || `org-${randomSuffix(4)}`;
  if (root.length < 3) root = `${root}-${randomSuffix(3)}`;
  if (root === SUPER_PROFILE_ID) root = `${root}-workspace`;

  let candidate = root.slice(0, 48);
  let counter = 1;
  while (await getProfile(candidate)) {
    counter += 1;
    const suffix = `-${counter}`;
    candidate = `${root.slice(0, 48 - suffix.length)}${suffix}`;
  }
  return candidate;
}

function legacyProfileName(user: UserRecord): string {
  const domain = normalizeEmail(user.email).split('@')[1] ?? '';
  const label = domain.split('.')[0] ?? '';
  const generic = new Set([
    'gmail',
    'yahoo',
    'outlook',
    'hotmail',
    'icloud',
    'protonmail',
    'live',
  ]);
  if (label && !generic.has(label)) {
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return `${displayName(user)}'s workspace`;
}

function legacyProfileBase(user: UserRecord): string {
  const email = normalizeEmail(user.email);
  const [local, domain] = email.split('@');
  const label = (domain ?? '').split('.')[0] ?? '';
  return label || local || `org-${randomSuffix(4)}`;
}

// ---------------------------------------------------------------------------
// Fixed super admin
// ---------------------------------------------------------------------------

/**
 * Create (or repair) the fixed developer account. The password is reset to the
 * configured credential on boot, so `developer@myenum.in` always works.
 */
export async function ensureDeveloperAccount(): Promise<void> {
  const existing = await findUserByEmail(SUPER_ADMIN_EMAIL);
  const now = nowIso();

  if (!existing) {
    await createUser({
      name: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
      role: 'admin',
      profileId: SUPER_PROFILE_ID,
      super: true,
    });
  } else {
    const passwordOk = await verifyPassword(
      SUPER_ADMIN_PASSWORD,
      existing.password_hash
    );
    await saveUser({
      ...existing,
      name: existing.name || SUPER_ADMIN_NAME,
      role: 'admin',
      active: true,
      profile_id: SUPER_PROFILE_ID,
      super: true,
      password_hash: passwordOk
        ? existing.password_hash
        : await hashPassword(SUPER_ADMIN_PASSWORD),
      updated_at: now,
    });
    invalidateUserCache(existing.email);
  }

  const profile = await ensureProfileRecord(SUPER_PROFILE_ID, {
    name: SUPER_ADMIN_NAME,
    ownerName: SUPER_ADMIN_NAME,
    ownerEmail: SUPER_ADMIN_EMAIL,
  });
  const expectedPaymentUrl = paymentUrlFor(SUPER_PROFILE_ID, SUPER_ADMIN_NAME);
  if (!profile.paymentUrl || profile.paymentUrl !== expectedPaymentUrl) {
    await putRecord(PROFILES, SUPER_PROFILE_ID, {
      ...profile,
      paymentUrl: expectedPaymentUrl,
      updatedAt: now,
    });
  }
}

// ---------------------------------------------------------------------------
// Existing accounts / legacy data
// ---------------------------------------------------------------------------

/**
 * Backfill a workspace for every account created before multi-tenancy.
 *
 * The oldest account without a profile is treated as the owner of the legacy
 * unscoped rows; later accounts start with an empty workspace. The fixed
 * developer account never absorbs legacy data.
 *
 * @returns the profile id that should receive legacy data, if any.
 */
export async function ensureAccountsAndProfiles(): Promise<string | null> {
  await ensureDeveloperAccount();

  const initial = await listUsers();
  const nonSuperUsers = initial.filter((user) => !isSuperUser(user));
  const legacyCandidate =
    nonSuperUsers.find((user) => user.role === 'admin') ??
    nonSuperUsers[0] ??
    null;

  let legacyProfileId: string | null = null;

  for (const user of initial) {
    if (isSuperUser(user)) {
      if (
        user.profile_id !== SUPER_PROFILE_ID ||
        user.super !== true ||
        user.role !== 'admin' ||
        user.active === false
      ) {
        await saveUser({
          ...user,
          role: 'admin',
          active: true,
          profile_id: SUPER_PROFILE_ID,
          super: true,
          updated_at: nowIso(),
        });
        invalidateUserCache(user.email);
      }
      continue;
    }

    let profileId = (user.profile_id ?? '').trim();
    if (!profileId) {
      profileId = await uniqueProfileId(legacyProfileBase(user));
      await ensureProfileRecord(profileId, {
        name: legacyProfileName(user),
        ownerName: displayName(user),
        ownerEmail: user.email,
      });
      await saveUser({
        ...user,
        profile_id: profileId,
        super: false,
        updated_at: nowIso(),
      });
      invalidateUserCache(user.email);
    } else {
      await ensureProfileRecord(profileId, {
        name: legacyProfileName(user),
        ownerName: displayName(user),
        ownerEmail: user.email,
      });
    }

    if (legacyCandidate && user.email === legacyCandidate.email) {
      legacyProfileId = profileId;
    }
  }

  // Give every workspace an administrator and backfill missing roles.
  const users = await listUsers();
  const byProfile = new Map<string, UserRecord[]>();
  for (const user of users) {
    const profileId = (user.profile_id ?? '').trim();
    if (!profileId) continue;
    const group = byProfile.get(profileId) ?? [];
    group.push(user);
    byProfile.set(profileId, group);
  }

  for (const [profileId, group] of byProfile) {
    let hasAdmin = group.some(
      (user) => user.role === 'admin' && user.active !== false
    );

    for (const user of group) {
      if (user.role) continue;
      const role = hasAdmin ? 'viewer' : 'admin';
      await saveUser({ ...user, role, updated_at: nowIso() });
      invalidateUserCache(user.email);
      if (role === 'admin') hasAdmin = true;
    }

    if (!hasAdmin) {
      const candidate = group
        .filter((user) => user.active !== false)
        .sort((a, b) => Number(a.id) - Number(b.id))[0];
      if (candidate && candidate.role !== 'admin') {
        await saveUser({
          ...candidate,
          role: 'admin',
          updated_at: nowIso(),
        });
        invalidateUserCache(candidate.email);
      }
      if (candidate) {
        console.log(
          `Promoted ${candidate.email} to administrator of ${profileId}`
        );
      }
    }
  }

  return legacyProfileId;
}

/**
 * Move rows written before multi-tenancy into the legacy owner's workspace.
 * A row is unscoped when its entity id has no `profileId:` namespace.
 */
export async function migrateLegacyData(profileId: string): Promise<void> {
  let moved = 0;

  // A row is scoped only when its entity id starts with a real profile id.
  // Checking for "any colon" would misclassify a legacy id that happens to
  // contain a colon.
  const profilePrefixes = (await listProfiles()).map(
    (profile) => `${profile.profileId}:`
  );

  for (const collection of SCOPED_TABLES) {
    const rows = await listRecords<Record<string, unknown>>(collection);
    for (const row of rows) {
      if (profilePrefixes.some((prefix) => row.entityId.startsWith(prefix))) {
        continue;
      }

      const data = { ...row.data };
      if (collection === APPWRITE_COLLECTIONS.paymentOrders) {
        if (!data.profileId) data.profileId = profileId;
      }
      if (collection === APPWRITE_COLLECTIONS.paymentEvents) {
        if (!data.profileId) data.profileId = profileId;
      }

      await putRecord(
        collection,
        scopedEntityId(profileId, row.entityId),
        data
      );
      await deleteRecord(collection, row.entityId);
      moved += 1;
    }
  }

  if (moved > 0) {
    console.log(
      `Moved ${moved} legacy ${moved === 1 ? 'row' : 'rows'} into profile ${profileId}`
    );
  }
}

/** Seed the dropdown lists that previously lived in one global table. */
export async function seedProfileDefaults(profileId: string): Promise<void> {
  const existing = await listScopedRecords<string[]>(
    APPWRITE_COLLECTIONS.dropdownOptions,
    profileId
  );
  const present = new Set(existing.map((record) => record.entityId));

  for (const [key, options] of Object.entries(DEFAULT_DROPDOWNS)) {
    if (present.has(key)) continue;
    await putRecord(
      APPWRITE_COLLECTIONS.dropdownOptions,
      scopedEntityId(profileId, key),
      options
    );
  }
}

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

export interface CreateWorkspaceInput {
  name: string;
  organization: string;
  email: string;
  password: string;
}

export async function createWorkspace(
  input: CreateWorkspaceInput
): Promise<{ user: UserRecord; profile: ProfileRecord }> {
  const email = normalizeEmail(input.email);
  if (email === SUPER_ADMIN_EMAIL) {
    throw Object.assign(
      new Error('This email is reserved for the system administrator.'),
      { statusCode: 409 }
    );
  }
  if (await findUserByEmail(email)) {
    throw Object.assign(new Error('A user with this email already exists.'), {
      statusCode: 409,
    });
  }

  const profileId = await generateProfileId();
  const profile = await createProfile({
    profileId,
    name: input.organization,
    ownerName: input.name,
    ownerEmail: email,
  });

  let created: UserRecord | null = null;
  try {
    created = await createUser({
      name: input.name,
      email,
      password: input.password,
      role: 'admin',
      profileId,
    });
    await seedProfileDefaults(profileId);
    return { user: created, profile };
  } catch (err) {
    // Only remove the account if this call created it. A concurrent signup with
    // the same email fails inside createUser and must not delete that account.
    if (created) {
      await removeUser(created.email).catch(() => undefined);
    }
    await deleteRecord(PROFILES, profileId).catch(() => undefined);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Request profile resolution
// ---------------------------------------------------------------------------

/**
 * The profile a request should operate on.
 *
 * Regular users are locked to their own profile. The super admin may pass
 * `X-Profile-Id` to open another workspace; the header is ignored for everyone
 * else and when the profile does not exist.
 */
export async function resolveProfileId(
  req: FastifyRequest
): Promise<string> {
  const own = (req.auth?.profile_id ?? '').trim() || SUPER_PROFILE_ID;
  if (!req.auth?.super) return own;

  const header = req.headers['x-profile-id'];
  const requested =
    typeof header === 'string'
      ? header.trim()
      : Array.isArray(header)
        ? (header[0] ?? '').trim()
        : '';
  if (!requested || !isValidProfileId(requested)) return own;
  if (requested === own) return own;

  const profile = await getProfile(requested);
  return profile ? requested : own;
}

export interface SessionProfiles {
  /** The account's home workspace. */
  profile: ProfileRecord;
  /** The workspace currently being viewed (differs for super-admin overrides). */
  activeProfile: ProfileRecord;
}

function fallbackProfile(profileId: string, email: string): ProfileRecord {
  const now = nowIso();
  const name = profileId === SUPER_PROFILE_ID ? SUPER_ADMIN_NAME : profileId;
  return {
    profileId,
    name,
    ownerName: '',
    ownerEmail: email,
    paymentUrl: paymentUrlFor(profileId, name),
    createdAt: now,
    updatedAt: now,
  };
}

export async function getProfileOrDefault(
  profileId: string,
  email: string
): Promise<ProfileRecord> {
  return (await getProfile(profileId)) ?? fallbackProfile(profileId, email);
}

export async function getSessionProfiles(
  req: FastifyRequest
): Promise<SessionProfiles> {
  const email = req.auth?.email ?? '';
  const homeId = (req.auth?.profile_id ?? '').trim() || SUPER_PROFILE_ID;
  const activeId = await resolveProfileId(req);

  const home = await getProfileOrDefault(homeId, email);
  const active =
    activeId === homeId
      ? home
      : await getProfileOrDefault(activeId, email);

  return { profile: home, activeProfile: active };
}

export async function ensureDefaultAccounts(): Promise<void> {
  const amarnathEmail = normalizeEmail('testuser2412@gmail.com');
  const existingAmarnath = await findUserByEmail(amarnathEmail);
  if (!existingAmarnath) {
    const profileId = 'ORG-XD3SLDDC';
    await createUser({
      name: 'Amarnath',
      email: amarnathEmail,
      password: 'Password@123',
      role: 'admin',
      profileId,
      super: false,
    });
    await ensureProfileRecord(profileId, {
      name: 'Amarnath',
      ownerName: 'Amarnath',
      ownerEmail: amarnathEmail,
    });
    await seedProfileDefaults(profileId);
  }

  const myenumEmail = normalizeEmail('myenumam@gmail.com');
  const existingMyenum = await findUserByEmail(myenumEmail);
  if (!existingMyenum) {
    const profileId = 'ORG-MYENUM';
    await createUser({
      name: 'Myenum',
      email: myenumEmail,
      password: 'Password@123',
      role: 'admin',
      profileId,
      super: false,
    });
    await ensureProfileRecord(profileId, {
      name: 'Myenum',
      ownerName: 'Myenum',
      ownerEmail: myenumEmail,
    });
    await seedProfileDefaults(profileId);
  }
}

