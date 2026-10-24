#!/usr/bin/env node
/**
 * Create the Appwrite database + tables used as the app's primary store.
 *
 * Usage:
 *   npm run appwrite:setup --workspace=backend
 *   npm run appwrite:setup --workspace=backend -- --dry-run
 *
 * Requires an Appwrite server API key with database, table, column, and row
 * scopes. The key is read from backend/.env as APPWRITE_API_KEY.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const endpoint = (
  process.env.APPWRITE_ENDPOINT ?? 'https://nyc.cloud.appwrite.io/v1'
).replace(/\/+$/, '');
const projectId = (
  process.env.APPWRITE_PROJECT_ID ?? '6adaf4be003ae5c9e622'
).trim();
const apiKey = (process.env.APPWRITE_API_KEY ?? '').trim();
const databaseId = (process.env.APPWRITE_DATABASE_ID ?? 'fees').trim();
const dryRun = process.argv.includes('--dry-run');

const tables = [
  { tableId: 'profiles', name: 'Profiles' },
  { tableId: 'fees', name: 'Fees' },
  { tableId: 'users', name: 'Users' },
  { tableId: 'students', name: 'Students' },
  { tableId: 'student_groups', name: 'Student Groups' },
  { tableId: 'fee_structures', name: 'Fee Structures' },
  { tableId: 'receipts', name: 'Receipts' },
  { tableId: 'announcements', name: 'Announcements' },
  { tableId: 'dropdown_options', name: 'Dropdown Options' },
  { tableId: 'payment_orders', name: 'Payment Orders' },
  { tableId: 'payment_events', name: 'Payment Events' },
  { tableId: 'payment_settings', name: 'Payment Settings' },
  { tableId: 'business_profiles', name: 'Business Profiles' },
];

const columns = [
  { type: 'varchar', key: 'entityId', size: 128, required: true },
  { type: 'longtext', key: 'payload', required: true },
  { type: 'varchar', key: 'createdAt', size: 64, required: true },
  { type: 'varchar', key: 'updatedAt', size: 64, required: true },
];

const schema = {
  endpoint,
  projectId,
  databaseId,
  database: { databaseId, name: 'Fees App' },
  tables: tables.map((table) => ({
    ...table,
    permissions: [],
    rowSecurity: false,
    columns,
  })),
};

if (dryRun) {
  console.log(JSON.stringify(schema, null, 2));
  process.exit(0);
}

if (!apiKey) {
  console.error(
    [
      'APPWRITE_API_KEY is not set in backend/.env.',
      '',
      'Create an Appwrite API key with the table/database scopes:',
      '  databases.read, databases.write',
      '  tables.read, tables.write',
      '  columns.read, columns.write',
      '  rows.read, rows.write',
      '',
      'Then add to backend/.env:',
      `  APPWRITE_ENDPOINT=${endpoint}`,
      `  APPWRITE_PROJECT_ID=${projectId}`,
      '  APPWRITE_API_KEY=<your server API key>',
      `  APPWRITE_DATABASE_ID=${databaseId}`,
    ].join('\n')
  );
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'X-Appwrite-Project': projectId,
  'X-Appwrite-Key': apiKey,
};

async function request(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${endpoint}${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function fail(step, result) {
  const detail =
    typeof result.body === 'string'
      ? result.body
      : JSON.stringify(result.body ?? {});
  throw new Error(`${step} failed (HTTP ${result.status}): ${detail}`);
}

function databasePath() {
  return `/databases/${encodeURIComponent(databaseId)}`;
}

function tablePath(tableId) {
  return `/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(
    tableId
  )}`;
}

async function ensureDatabase() {
  // Check first: Appwrite returns a plan-limit 403 instead of 409 when the
  // database already exists on a plan with a one-database cap.
  const existing = await request(databasePath());
  if (existing.ok) {
    console.log(`Database "${databaseId}" already exists.`);
    return;
  }
  if (existing.status !== 404) fail('Check database', existing);

  const res = await request('/databases', {
    method: 'POST',
    body: JSON.stringify(schema.database),
  });
  if (!res.ok && res.status !== 409) fail('Create database', res);
  console.log(`Created database "${databaseId}".`);
}

async function ensureTable(table) {
  const existing = await request(tablePath(table.tableId));
  if (existing.ok) {
    console.log(`  Table "${table.tableId}" already exists.`);
    return;
  }
  if (existing.status !== 404) {
    fail(`Check table "${table.tableId}"`, existing);
  }

  const res = await request(
    `/tablesdb/${encodeURIComponent(databaseId)}/tables`,
    {
      method: 'POST',
      body: JSON.stringify({
        tableId: table.tableId,
        name: table.name,
        permissions: table.permissions,
        rowSecurity: table.rowSecurity,
      }),
    }
  );
  if (!res.ok && res.status !== 409) {
    fail(`Create table "${table.tableId}"`, res);
  }
  console.log(`  Created table "${table.tableId}".`);
}

async function ensureColumns(table) {
  const path = `${tablePath(table.tableId)}/columns`;
  const existing = await request(path);
  if (!existing.ok) fail(`List columns for "${table.tableId}"`, existing);
  const existingKeys = new Set(
    (existing.body?.columns ?? []).map((column) => column.key)
  );

  for (const column of columns) {
    if (existingKeys.has(column.key)) continue;
    const { type, ...body } = column;
    const created = await request(`${path}/${type}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!created.ok && created.status !== 409) {
      fail(
        `Create column "${column.key}" on "${table.tableId}"`,
        created
      );
    }
  }
}

async function waitForColumns(table) {
  const path = `${tablePath(table.tableId)}/columns`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const list = await request(path);
    if (!list.ok) fail(`List columns for "${table.tableId}"`, list);
    const current = list.body?.columns ?? [];
    const failed = current.find((column) => column.status === 'failed');
    if (failed) {
      throw new Error(
        `Column "${failed.key}" on "${table.tableId}" failed to build.`
      );
    }
    const ready = columns.every((wanted) => {
      const column = current.find((item) => item.key === wanted.key);
      return Boolean(column) && (!column.status || column.status === 'available');
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for columns on "${table.tableId}".`);
}

async function main() {
  console.log(`Appwrite: ${endpoint} · project ${projectId}`);
  await ensureDatabase();

  for (const table of tables) {
    await ensureTable(table);
    await ensureColumns(table);
  }

  console.log('Waiting for Appwrite to finish building columns…');
  for (const table of tables) {
    await waitForColumns(table);
    console.log(`  ${table.tableId}: ready`);
  }

  console.log('');
  console.log('Appwrite tables are ready.');
  console.log('Next: import existing Postgres data with:');
  console.log('  npm run appwrite:migrate --workspace=backend');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
