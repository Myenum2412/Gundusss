import { pool } from './db.js';

/**
 * Full-data mirror to Appwrite.
 *
 * Postgres remains the source of truth for payments, receipts, and the live
 * dashboard. After every successful mutation (and once at startup) this module
 * writes a complete snapshot of each app collection into one Appwrite
 * collection. That keeps Appwrite in sync without changing the transaction
 * boundaries that the payment flow depends on.
 *
 * The mirror is opt-in: it does nothing unless APPWRITE_API_KEY is set.
 */

const ENDPOINT = (
  process.env.APPWRITE_ENDPOINT ?? 'https://nyc.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const PROJECT_ID = (process.env.APPWRITE_PROJECT_ID ?? '6adaf4be003ae5c9e622').trim();
const API_KEY = (process.env.APPWRITE_API_KEY ?? '').trim();
const DATABASE_ID = (process.env.APPWRITE_DATABASE_ID ?? 'fees').trim();
const COLLECTION_ID = (process.env.APPWRITE_STATE_COLLECTION_ID ?? 'app_state').trim();
const SYNC_DEBOUNCE_MS = 750;

export interface AppwriteSyncStatus {
  configured: boolean;
  endpoint: string;
  projectId: string;
  databaseId: string;
  collectionId: string;
  lastSyncAt: string | null;
  lastReason: string | null;
  lastError: string | null;
  documentCount: number;
}

const status: AppwriteSyncStatus = {
  configured: Boolean(API_KEY),
  endpoint: ENDPOINT,
  projectId: PROJECT_ID,
  databaseId: DATABASE_ID,
  collectionId: COLLECTION_ID,
  lastSyncAt: null,
  lastReason: null,
  lastError: null,
  documentCount: 0,
};

interface Snapshot {
  id: string;
  sql: string;
}

// Excludes users/password hashes on purpose. Everything else that the app
// stores is mirrored as a complete JSON snapshot.
const SNAPSHOTS: Snapshot[] = [
  { id: 'fees', sql: 'SELECT * FROM fees ORDER BY id' },
  { id: 'students', sql: 'SELECT * FROM students ORDER BY student_id' },
  { id: 'student_groups', sql: 'SELECT * FROM student_groups ORDER BY group_id' },
  { id: 'fee_structures', sql: 'SELECT * FROM fee_structures ORDER BY structure_id' },
  { id: 'receipts', sql: 'SELECT * FROM receipts ORDER BY receipt_id' },
  { id: 'announcements', sql: 'SELECT * FROM announcements ORDER BY announcement_id' },
  { id: 'dropdown_options', sql: 'SELECT * FROM dropdown_options ORDER BY list_key' },
  { id: 'payment_orders', sql: 'SELECT * FROM payment_orders ORDER BY created_at DESC' },
  { id: 'payment_events', sql: 'SELECT * FROM payment_events ORDER BY created_at ASC, id ASC' },
  { id: 'payment_settings', sql: 'SELECT * FROM payment_settings ORDER BY id' },
  { id: 'business_profiles', sql: 'SELECT * FROM business_profiles ORDER BY id' },
];

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let queued = false;

export function isAppwriteConfigured(): boolean {
  return Boolean(API_KEY);
}

export function getAppwriteStatus(): AppwriteSyncStatus {
  return { ...status };
}

function collectionPath(): string {
  return `/databases/${encodeURIComponent(DATABASE_ID)}/collections/${encodeURIComponent(
    COLLECTION_ID
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
    signal: AbortSignal.timeout(20_000),
  });
}

async function responseDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return text.slice(0, 500);
}

async function upsertDocument(
  documentId: string,
  data: Record<string, unknown>
): Promise<void> {
  const path = collectionPath();
  const create = await appwriteFetch(`${path}/documents`, {
    method: 'POST',
    body: JSON.stringify({ documentId, data }),
  });
  if (create.ok) return;

  if (create.status === 409) {
    const update = await appwriteFetch(
      `${path}/documents/${encodeURIComponent(documentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ data }),
      }
    );
    if (update.ok) return;
    throw new Error(
      `Appwrite update failed (${update.status}): ${await responseDetail(update)}`
    );
  }

  throw new Error(
    `Appwrite create failed (${create.status}): ${await responseDetail(create)}`
  );
}

/**
 * Write a complete snapshot of every collection to Appwrite.
 * Safe to call from an HTTP hook: it never throws.
 */
export async function syncAllToAppwrite(reason = 'manual'): Promise<void> {
  if (!isAppwriteConfigured()) return;
  if (running) {
    queued = true;
    return;
  }

  running = true;
  status.lastReason = reason;
  try {
    let documentCount = 0;
    for (const snapshot of SNAPSHOTS) {
      const { rows } = await pool.query(snapshot.sql);
      await upsertDocument(snapshot.id, {
        entity: snapshot.id,
        payload: JSON.stringify(rows),
        count: rows.length,
        updatedAt: new Date().toISOString(),
      });
      documentCount += 1;
    }
    status.lastSyncAt = new Date().toISOString();
    status.lastError = null;
    status.documentCount = documentCount;
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    // Do not fail the request that triggered the mirror.
    console.error('[Appwrite] sync failed:', status.lastError);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void syncAllToAppwrite('queued');
    }
  }
}

/** Debounced sync used by the server's onResponse hook. */
export function scheduleAppwriteSync(reason = 'mutation'): void {
  if (!isAppwriteConfigured()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncAllToAppwrite(reason);
  }, SYNC_DEBOUNCE_MS);
}
