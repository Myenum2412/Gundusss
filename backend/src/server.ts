import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool } from './db.js';
import { feeRoutes } from './routes/fees.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(','),
});

app.get('/api/health', async () => ({
  ok: true,
  time: new Date().toISOString(),
}));

await app.register(feeRoutes);

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
  `);
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
