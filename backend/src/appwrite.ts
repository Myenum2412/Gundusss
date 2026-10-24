import { createHash } from 'node:crypto';

/**
 * Appwrite TablesDB is the primary data store for the fees app.
 *
 * Each app entity is a row in its own table. A row stores the entity's JSON
 * payload plus the logical entity id, so the backend can keep the same API
 * shapes the frontend already uses. Row ids are deterministic hashes of the
 * logical id, which makes upserts safe without a transaction.
 */

const ENDPOINT = (
  process.env.APPWRITE_ENDPOINT ?? 'https://nyc.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const PROJECT_ID = (process.env.APPWRITE_PROJECT_ID ?? '6adaf4be003ae5c9e622').trim();
const API_KEY = (process.env.APPWRITE_API_KEY ?? '').trim();
const DATABASE_ID = (process.env.APPWRITE_DATABASE_ID ?? 'fees').trim();

export const APPWRITE_COLLECTIONS = {
  fees: 'fees',
  users: 'users',
  students: 'students',
  studentGroups: 'student_groups',
  feeStructures: 'fee_structures',
  receipts: 'receipts',
  announcements: 'announcements',
  dropdownOptions: 'dropdown_options',
  paymentOrders: 'payment_orders',
  paymentEvents: 'payment_events',
  paymentSettings: 'payment_settings',
  businessProfiles: 'business_profiles',
} as const;

export type AppwriteCollection =
  (typeof APPWRITE_COLLECTIONS)[keyof typeof APPWRITE_COLLECTIONS];

export const APPWRITE_COLLECTION_IDS = Object.values(APPWRITE_COLLECTIONS);

export interface StoredRecord<T> {
  entityId: string;
  data: T;
  createdAt: string;
  updatedAt: string;
}

export interface AppwriteStatus {
  configured: boolean;
  endpoint: string;
  projectId: string;
  databaseId: string;
  tables: string[];
  missingTables: string[];
  lastError: string | null;
}

let lastError: string | null = null;
let missingTables: string[] = [];

export function isAppwriteConfigured(): boolean {
  return Boolean(API_KEY);
}

export function getAppwriteStatus(): AppwriteStatus {
  return {
    configured: Boolean(API_KEY),
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    databaseId: DATABASE_ID,
    tables: APPWRITE_COLLECTION_IDS,
    missingTables,
    lastError,
  };
}

function requireConfig(): void {
  if (!API_KEY) {
    throw new Error(
      'APPWRITE_API_KEY is not configured. Add it to backend/.env and restart the backend.'
    );
  }
}

function rowId(collection: AppwriteCollection, entityId: string): string {
  return createHash('sha256')
    .update(`${collection}\u0000${entityId}`)
    .digest('hex')
    .slice(0, 32);
}

function tablePath(collection: AppwriteCollection): string {
  return `/tablesdb/${encodeURIComponent(DATABASE_ID)}/tables/${encodeURIComponent(
    collection
  )}`;
}

async function appwriteFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${ENDPOINT}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': PROJECT_ID,
      'X-Appwrite-Key': API_KEY,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
}

async function responseDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return text.slice(0, 1_000);
}

async function assertOk(res: Response, action: string): Promise<void> {
  if (res.ok) return;
  const detail = await responseDetail(res);
  lastError = `${action} failed (HTTP ${res.status}): ${detail}`;
  throw new Error(lastError);
}

function query(method: string, values: unknown[]): string {
  return JSON.stringify({ method, values });
}

function mapRow<T>(row: Record<string, unknown>): StoredRecord<T> {
  const raw = row.payload;
  if (typeof raw !== 'string') {
    throw new Error('Appwrite row is missing its JSON payload.');
  }
  let data: T;
  try {
    data = JSON.parse(raw) as T;
  } catch {
    throw new Error('Appwrite row payload is not valid JSON.');
  }
  return {
    entityId: String(row.entityId ?? ''),
    data,
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
  };
}

/** List every row in a table, following Appwrite pagination. */
export async function listRecords<T>(
  collection: AppwriteCollection
): Promise<StoredRecord<T>[]> {
  requireConfig();
  const limit = 100;
  let offset = 0;
  const records: StoredRecord<T>[] = [];

  while (true) {
    const params = new URLSearchParams();
    params.append('queries[]', query('limit', [limit]));
    params.append('queries[]', query('offset', [offset]));
    const res = await appwriteFetch(
      `${tablePath(collection)}/rows?${params.toString()}`
    );
    await assertOk(res, `List ${collection}`);
    const json = (await res.json()) as {
      total?: number;
      rows?: Record<string, unknown>[];
    };
    const rows = json.rows ?? [];
    records.push(...rows.map((row) => mapRow<T>(row)));
    if (rows.length < limit) break;
    offset += limit;
    if (typeof json.total === 'number' && offset >= json.total) break;
  }

  return records;
}

/** Read one row by its logical entity id. */
export async function getRecord<T>(
  collection: AppwriteCollection,
  entityId: string
): Promise<StoredRecord<T> | null> {
  requireConfig();
  const res = await appwriteFetch(
    `${tablePath(collection)}/rows/${rowId(collection, entityId)}`
  );
  if (res.status === 404) return null;
  await assertOk(res, `Get ${collection}/${entityId}`);
  return mapRow<T>((await res.json()) as Record<string, unknown>);
}

/** Create or replace one row. Appwrite's PUT is an upsert. */
export async function putRecord<T>(
  collection: AppwriteCollection,
  entityId: string,
  data: T
): Promise<void> {
  requireConfig();
  const now = new Date().toISOString();
  const res = await appwriteFetch(
    `${tablePath(collection)}/rows/${rowId(collection, entityId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        data: {
          entityId,
          payload: JSON.stringify(data),
          createdAt: now,
          updatedAt: now,
        },
      }),
    }
  );
  await assertOk(res, `Save ${collection}/${entityId}`);
}

/** Delete one row; a missing row is treated as already deleted. */
export async function deleteRecord(
  collection: AppwriteCollection,
  entityId: string
): Promise<void> {
  requireConfig();
  const res = await appwriteFetch(
    `${tablePath(collection)}/rows/${rowId(collection, entityId)}`,
    { method: 'DELETE' }
  );
  if (res.status === 404) return;
  await assertOk(res, `Delete ${collection}/${entityId}`);
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(limit, Math.max(items.length, 1)) },
    async () => {
      while (index < items.length) {
        const item = items[index];
        index += 1;
        await run(item);
      }
    }
  );
  await Promise.all(workers);
}

/**
 * Replace a whole table, matching the frontend's "save the entire list"
 * pattern. New rows are upserted; rows no longer present are deleted.
 */
export async function replaceAllRecords<T>(
  collection: AppwriteCollection,
  items: Array<{ entityId: string; data: T }>
): Promise<void> {
  requireConfig();
  const existing = await listRecords<T>(collection);
  const wanted = new Set(items.map((item) => item.entityId));
  const stale = existing.filter((record) => !wanted.has(record.entityId));

  await mapLimit(stale, 4, (record) => deleteRecord(collection, record.entityId));
  await mapLimit(items, 4, (item) =>
    putRecord(collection, item.entityId, item.data)
  );
}

/** Return the table ids that do not exist in the configured database. */
export async function checkAppwriteSetup(): Promise<string[]> {
  requireConfig();
  const missing: string[] = [];
  for (const collection of APPWRITE_COLLECTION_IDS) {
    const res = await appwriteFetch(tablePath(collection));
    if (res.status === 404) {
      missing.push(collection);
      continue;
    }
    await assertOk(res, `Check ${collection}`);
  }
  missingTables = missing;
  return missing;
}

/** Fail fast at boot with an actionable message when the schema is missing. */
export async function assertAppwriteSetup(): Promise<void> {
  const missing = await checkAppwriteSetup();
  if (missing.length > 0) {
    throw new Error(
      `Appwrite tables are missing: ${missing.join(', ')}. ` +
        'Run: npm run appwrite:setup --workspace=backend'
    );
  }
}
