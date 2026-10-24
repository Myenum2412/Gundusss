import pg from 'pg';

/**
 * Legacy Postgres/PGlite connection used only by the one-time
 * `appwrite:migrate` import. The backend runtime does not import this module.
 */

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set, defaulting to local postgres');
}

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://fees:fees@localhost:5432/fees',
  max: 10,
});
