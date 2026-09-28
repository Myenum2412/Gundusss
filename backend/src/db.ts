import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set, defaulting to local postgres');
}

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://fees:fees@localhost:5432/fees',
  max: 10,
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}
