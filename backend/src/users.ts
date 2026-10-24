import bcrypt from 'bcryptjs';

import {
  APPWRITE_COLLECTIONS,
  deleteRecord,
  getRecord,
  listRecords,
  putRecord,
} from './appwrite.js';

/**
 * Application users live in the Appwrite `users` table.
 *
 * A row's entity id is the normalized email address and the row payload holds
 * the account record. Role/name/active are optional so accounts created before
 * RBAC existed keep working: they are normalised on read and backfilled on
 * startup (see server.ts).
 */

export type Role = 'admin' | 'accountant' | 'viewer';

export const ROLES: Role[] = ['admin', 'accountant', 'viewer'];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  accountant: 'Accountant',
  viewer: 'Viewer',
};

export interface UserRecord {
  id: number;
  name?: string;
  email: string;
  password_hash: string;
  role?: Role;
  active?: boolean;
  created_at: string;
  updated_at?: string;
}

/** Shape safe to send to the browser (never includes the password hash). */
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function normalizeRole(value: unknown): Role {
  return ROLES.includes(value as Role) ? (value as Role) : 'viewer';
}

export function displayName(user: Pick<UserRecord, 'name' | 'email'>): string {
  const name = (user.name ?? '').trim();
  if (name) return name;
  const local = user.email.split('@')[0] ?? user.email;
  return local || user.email;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: Number(user.id) || 0,
    name: displayName(user),
    email: normalizeEmail(user.email),
    role: normalizeRole(user.role),
    active: user.active !== false,
    created_at: user.created_at,
  };
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** List every account, oldest first. */
export async function listUsers(): Promise<UserRecord[]> {
  const rows = await listRecords<UserRecord>(APPWRITE_COLLECTIONS.users);
  return rows
    .map((row) => row.data)
    .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
}

export async function countUsers(): Promise<number> {
  return (await listUsers()).length;
}

export async function findUserByEmail(
  email: string
): Promise<UserRecord | null> {
  const record = await getRecord<UserRecord>(
    APPWRITE_COLLECTIONS.users,
    normalizeEmail(email)
  );
  return record?.data ?? null;
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  const users = await listUsers();
  return users.find((user) => Number(user.id) === Number(id)) ?? null;
}

export async function saveUser(user: UserRecord): Promise<void> {
  await putRecord<UserRecord>(
    APPWRITE_COLLECTIONS.users,
    normalizeEmail(user.email),
    { ...user, email: normalizeEmail(user.email) }
  );
}

export async function removeUser(email: string): Promise<void> {
  await deleteRecord(APPWRITE_COLLECTIONS.users, normalizeEmail(email));
}

// User creation reads the current list to pick the next numeric id. Serialize
// creates in-process so two simultaneous requests cannot pick the same id.
let createLock: Promise<unknown> = Promise.resolve();

export interface CreateUserInput {
  name?: string;
  email: string;
  password: string;
  role: Role;
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const run = async (): Promise<UserRecord> => {
    const email = normalizeEmail(input.email);
    const existing = await findUserByEmail(email);
    if (existing) {
      throw Object.assign(new Error('A user with this email already exists.'), {
        statusCode: 409,
      });
    }

    const users = await listUsers();
    const nextId = users.reduce((max, user) => Math.max(max, Number(user.id) || 0), 0) + 1;
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: nextId,
      name: (input.name ?? '').trim() || undefined,
      email,
      password_hash: await hashPassword(input.password),
      role: normalizeRole(input.role),
      active: true,
      created_at: now,
      updated_at: now,
    };
    await saveUser(user);
    invalidateUserCache(email);
    return user;
  };

  const result = createLock.then(run, run);
  createLock = result.catch(() => undefined);
  return result;
}

// ---------------------------------------------------------------------------
// Auth cache
// ---------------------------------------------------------------------------

// Every API request resolves the caller's current account so role changes and
// disabled accounts take effect immediately. A short cache keeps the extra
// Appwrite read off hot paths (polling endpoints).
const USER_CACHE_TTL_MS = 30_000;
const userCache = new Map<string, { user: PublicUser | null; at: number }>();

export function invalidateUserCache(email?: string): void {
  if (email) userCache.delete(normalizeEmail(email));
  else userCache.clear();
}

export async function getAuthUser(email: string): Promise<PublicUser | null> {
  const key = normalizeEmail(email);
  const cached = userCache.get(key);
  if (cached && Date.now() - cached.at < USER_CACHE_TTL_MS) {
    return cached.user;
  }

  const record = await findUserByEmail(key);
  const user = record ? toPublicUser(record) : null;
  userCache.set(key, { user, at: Date.now() });
  return user;
}
