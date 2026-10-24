#!/usr/bin/env node
/**
 * Create the Appwrite database/collection/attributes used by the data mirror.
 *
 * Usage:
 *   npm run appwrite:setup --workspace=backend
 *   npm run appwrite:setup --workspace=backend -- --dry-run
 *
 * Requires an Appwrite server API key with database, collection, attribute,
 * and document scopes. The key is read from backend/.env as APPWRITE_API_KEY.
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
const collectionId = (
  process.env.APPWRITE_STATE_COLLECTION_ID ?? 'app_state'
).trim();
const dryRun = process.argv.includes('--dry-run');

const schema = {
  endpoint,
  projectId,
  databaseId,
  collectionId,
  database: { databaseId, name: 'Fees App' },
  collection: {
    collectionId,
    name: 'App State',
    permissions: [],
    documentSecurity: false,
  },
  attributes: [
    { type: 'string', key: 'entity', size: 64, required: true },
    { type: 'string', key: 'payload', size: 16_777_216, required: true },
    {
      type: 'integer',
      key: 'count',
      required: true,
      min: 0,
      max: 2_147_483_647,
    },
    { type: 'string', key: 'updatedAt', size: 64, required: true },
  ],
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
      'Create an Appwrite API key with these scopes:',
      '  databases.read, databases.write',
      '  collections.read, collections.write',
      '  attributes.read, attributes.write',
      '  documents.read, documents.write',
      '',
      'Then add to backend/.env:',
      `  APPWRITE_ENDPOINT=${endpoint}`,
      `  APPWRITE_PROJECT_ID=${projectId}`,
      '  APPWRITE_API_KEY=<your server API key>',
      `  APPWRITE_DATABASE_ID=${databaseId}`,
      `  APPWRITE_STATE_COLLECTION_ID=${collectionId}`,
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
  const res = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text().catch(() => '');
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

function fail(step, result) {
  const detail =
    typeof result.body === 'string'
      ? result.body
      : JSON.stringify(result.body ?? {});
  throw new Error(`${step} failed (HTTP ${result.status}): ${detail}`);
}

async function main() {
  console.log(`Appwrite: ${endpoint} · project ${projectId}`);

  let res = await request('/databases', {
    method: 'POST',
    body: JSON.stringify(schema.database),
  });
  if (!res.ok && res.status !== 409) fail('Create database', res);
  console.log(
    res.status === 409
      ? `Database "${databaseId}" already exists.`
      : `Created database "${databaseId}".`
  );

  res = await request(`/databases/${encodeURIComponent(databaseId)}/collections`, {
    method: 'POST',
    body: JSON.stringify(schema.collection),
  });
  if (!res.ok && res.status !== 409) fail('Create collection', res);
  console.log(
    res.status === 409
      ? `Collection "${collectionId}" already exists.`
      : `Created collection "${collectionId}".`
  );

  const attributesPath = `/databases/${encodeURIComponent(
    databaseId
  )}/collections/${encodeURIComponent(collectionId)}/attributes`;
  const existing = await request(attributesPath);
  if (!existing.ok) fail('List attributes', existing);
  const existingKeys = new Set(
    (existing.body?.attributes ?? []).map((attr) => attr.key)
  );

  for (const attr of schema.attributes) {
    if (existingKeys.has(attr.key)) {
      console.log(`Attribute "${attr.key}" already exists.`);
      continue;
    }
    const { type, ...body } = attr;
    const created = await request(`${attributesPath}/${type}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!created.ok) fail(`Create attribute "${attr.key}"`, created);
    console.log(`Creating attribute "${attr.key}"…`);
  }

  // Appwrite builds attributes asynchronously; wait before the backend writes.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const list = await request(attributesPath);
    if (!list.ok) fail('List attributes', list);
    const attributes = list.body?.attributes ?? [];
    const failed = attributes.find((attr) => attr.status === 'failed');
    if (failed) {
      throw new Error(`Attribute "${failed.key}" failed to build.`);
    }
    const ready = schema.attributes.every((wanted) =>
      attributes.some(
        (attr) => attr.key === wanted.key && attr.status === 'available'
      )
    );
    if (ready) {
      console.log('All Appwrite attributes are available.');
      console.log('');
      console.log('Next: restart the backend. It will mirror all data on startup');
      console.log('and after every write. Check GET /api/appwrite/status.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(
    'Timed out waiting for Appwrite attributes. Check the Appwrite console.'
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
