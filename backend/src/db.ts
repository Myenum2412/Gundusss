import pg from 'pg';

const { Pool } = pg;

/**
 * PostgreSQL is the primary data store for the fees app.
 *
 * Each app entity is a row in its own table. A row stores the entity's JSON
 * payload plus the logical entity id, so the backend can keep the same API
 * shapes the frontend already uses.
 */

export const DB_TABLES = {
  profiles: 'profiles',
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
  branches: 'branches',
} as const;

// Backward-compatible alias so existing modules work seamlessly
export const APPWRITE_COLLECTIONS = DB_TABLES;
export type DbTable = (typeof DB_TABLES)[keyof typeof DB_TABLES];
export type AppwriteCollection = DbTable;

export const DB_TABLE_NAMES = Object.values(DB_TABLES);
export const APPWRITE_COLLECTION_IDS = DB_TABLE_NAMES;

const VALID_TABLES = new Set(DB_TABLE_NAMES as string[]);

function getTable(collection: string): string {
  if (!VALID_TABLES.has(collection)) {
    throw new Error(`Invalid table name: ${collection}`);
  }
  return collection;
}

export interface StoredRecord<T> {
  entityId: string;
  data: T;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseStatus {
  configured: boolean;
  type: string;
  database: string;
  tables: string[];
  missingTables: string[];
  lastError: string | null;
}

export type AppwriteStatus = DatabaseStatus;

let rawUrl = (
  process.env.DATABASE_URL ?? 'postgres://fees:fees@127.0.0.1:5432/fees'
).trim();

// Avoid IPv6 resolution issues with "localhost" on some Node versions
if (rawUrl.includes('@localhost:')) {
  rawUrl = rawUrl.replace('@localhost:', '@127.0.0.1:');
}

export const pool = new Pool({
  connectionString: rawUrl,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

let lastError: string | null = null;
let missingTables: string[] = [];

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL || rawUrl);
}

export const isAppwriteConfigured = isDatabaseConfigured;

export function getDatabaseStatus(): DatabaseStatus {
  return {
    configured: isDatabaseConfigured(),
    type: 'PostgreSQL',
    database: 'fees',
    tables: DB_TABLE_NAMES,
    missingTables,
    lastError,
  };
}

export const getAppwriteStatus = getDatabaseStatus;

function mapRow<T>(row: Record<string, unknown>): StoredRecord<T> {
  let data: T;
  const raw = row.payload;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw) as T;
    } catch {
      throw new Error('Database row payload is not valid JSON.');
    }
  } else if (raw && typeof raw === 'object') {
    data = raw as T;
  } else {
    throw new Error('Database row is missing its JSON payload.');
  }

  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt ?? '');
  const updatedAt =
    row.updatedAt instanceof Date
      ? row.updatedAt.toISOString()
      : String(row.updatedAt ?? '');

  return {
    entityId: String(row.entityId ?? ''),
    data,
    createdAt,
    updatedAt,
  };
}

/** List every row in a table ordered by created_at. */
export async function listRecords<T>(
  collection: DbTable
): Promise<StoredRecord<T>[]> {
  const table = getTable(collection);
  try {
    const res = await pool.query(
      `SELECT entity_id AS "entityId", payload, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ${table}
       ORDER BY created_at ASC`
    );
    return res.rows.map((row) => mapRow<T>(row));
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/** Read one row by its logical entity id. */
export async function getRecord<T>(
  collection: DbTable,
  entityId: string
): Promise<StoredRecord<T> | null> {
  const table = getTable(collection);
  try {
    const res = await pool.query(
      `SELECT entity_id AS "entityId", payload, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ${table}
       WHERE entity_id = $1`,
      [entityId]
    );
    if (res.rows.length === 0) return null;
    return mapRow<T>(res.rows[0]);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/** Create or replace one row via upsert. */
export async function putRecord<T>(
  collection: DbTable,
  entityId: string,
  data: T
): Promise<void> {
  const table = getTable(collection);
  const now = new Date().toISOString();
  try {
    await pool.query(
      `INSERT INTO ${table} (entity_id, payload, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (entity_id) DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at`,
      [entityId, JSON.stringify(data), now, now]
    );
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/** Delete one row; a missing row is treated as already deleted. */
export async function deleteRecord(
  collection: DbTable,
  entityId: string
): Promise<void> {
  const table = getTable(collection);
  try {
    await pool.query(`DELETE FROM ${table} WHERE entity_id = $1`, [entityId]);
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/**
 * Replace a whole table, matching the frontend's "save the entire list" pattern.
 * Runs atomically in a single transaction.
 */
export async function replaceAllRecords<T>(
  collection: DbTable,
  items: Array<{ entityId: string; data: T }>
): Promise<void> {
  const table = getTable(collection);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (items.length === 0) {
      await client.query(`DELETE FROM ${table}`);
    } else {
      const wantedIds = items.map((item) => item.entityId);
      await client.query(
        `DELETE FROM ${table} WHERE NOT (entity_id = ANY($1::text[]))`,
        [wantedIds]
      );
      const now = new Date().toISOString();
      for (const item of items) {
        await client.query(
          `INSERT INTO ${table} (entity_id, payload, created_at, updated_at)
           VALUES ($1, $2::jsonb, $3, $4)
           ON CONFLICT (entity_id) DO UPDATE SET
             payload = EXCLUDED.payload,
             updated_at = EXCLUDED.updated_at`,
          [item.entityId, JSON.stringify(item.data), now, now]
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    lastError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List only the rows that belong to one profile. Returned entity ids have the
 * `profileId:` namespace removed, so callers keep working with logical ids.
 */
export async function listScopedRecords<T>(
  collection: DbTable,
  profileId: string
): Promise<StoredRecord<T>[]> {
  const table = getTable(collection);
  const prefix = `${profileId}:`;
  try {
    const res = await pool.query(
      `SELECT entity_id AS "entityId", payload, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ${table}
       WHERE entity_id LIKE $1 || '%'
       ORDER BY created_at ASC`,
      [prefix]
    );
    return res.rows.map((row) => {
      const record = mapRow<T>(row);
      return {
        ...record,
        entityId: record.entityId.slice(prefix.length),
      };
    });
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/**
 * Replace one profile's slice of a table atomically. Rows belonging to other
 * profiles are never read, deleted, or overwritten.
 */
export async function replaceScopedRecords<T>(
  collection: DbTable,
  profileId: string,
  items: Array<{ entityId: string; data: T }>
): Promise<void> {
  const table = getTable(collection);
  const prefix = `${profileId}:`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (items.length === 0) {
      await client.query(`DELETE FROM ${table} WHERE entity_id LIKE $1 || '%'`, [prefix]);
    } else {
      const wantedFullIds = items.map((item) => `${prefix}${item.entityId}`);
      await client.query(
        `DELETE FROM ${table} WHERE entity_id LIKE $1 || '%' AND NOT (entity_id = ANY($2::text[]))`,
        [prefix, wantedFullIds]
      );
      const now = new Date().toISOString();
      for (const item of items) {
        const fullId = `${prefix}${item.entityId}`;
        await client.query(
          `INSERT INTO ${table} (entity_id, payload, created_at, updated_at)
           VALUES ($1, $2::jsonb, $3, $4)
           ON CONFLICT (entity_id) DO UPDATE SET
             payload = EXCLUDED.payload,
             updated_at = EXCLUDED.updated_at`,
          [fullId, JSON.stringify(item.data), now, now]
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    lastError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    client.release();
  }
}

/** Ensure all tables and indexes exist in PostgreSQL. */
export async function initDatabase(): Promise<void> {
  for (const table of DB_TABLE_NAMES) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        entity_id VARCHAR(128) PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_${table}_prefix ON ${table} (entity_id varchar_pattern_ops);
    `);
  }
}

/** Return the table names that do not exist in the configured database. */
export async function checkDatabaseSetup(): Promise<string[]> {
  try {
    const res = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const existing = new Set(res.rows.map((r: { table_name: string }) => r.table_name));
    missingTables = DB_TABLE_NAMES.filter((t) => !existing.has(t));
    return missingTables;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    return DB_TABLE_NAMES;
  }
}

export const checkAppwriteSetup = checkDatabaseSetup;

/** Fail fast at boot with an actionable message when the schema is missing. */
export async function assertDatabaseSetup(): Promise<void> {
  await initDatabase();
  const missing = await checkDatabaseSetup();
  if (missing.length > 0) {
    throw new Error(
      `PostgreSQL tables are missing: ${missing.join(', ')}.`
    );
  }
}

export const assertAppwriteSetup = assertDatabaseSetup;
