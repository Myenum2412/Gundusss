import Fastify from 'fastify';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { feeRoutes } from './routes/fees.js';
import { authRoutes } from './routes/auth.js';
import { whatsappRoutes } from './routes/whatsapp.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(','),
});

app.get('/api/health', async () => ({
  ok: true,
  time: new Date().toISOString(),
}));

await app.register(feeRoutes);
await app.register(authRoutes);
await app.register(whatsappRoutes);

const SEED_EMAIL = 'admin@seedsofsuccess.com';
const SEED_PASSWORD = 'Admin123!';

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fees (
      id SERIAL PRIMARY KEY,
      student_name VARCHAR(200) NOT NULL,
      amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue')),
      due_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed default login user (PostgreSQL) if missing.
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [SEED_EMAIL]);
  if (existing.rowCount === 0) {
    const hash = await bcrypt.hash(SEED_PASSWORD, 10);
    await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [SEED_EMAIL, hash]);
  }
}

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  await ensureSchema();
  await app.listen({ port, host });
  console.log(`Backend listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
