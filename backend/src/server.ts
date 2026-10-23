import './env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import { Readable } from 'node:stream';
import { pool } from './db.js';
import { feeRoutes } from './routes/fees.js';
import { authRoutes } from './routes/auth.js';
import { whatsappRoutes } from './routes/whatsapp.js';
import { collectionsRoutes } from './routes/collections.js';
import { paymentRoutes } from './routes/payments.js';
import { paymentSettingsRoutes } from './routes/payment-settings.js';
import { businessProfileRoutes } from './routes/business-profile.js';

declare module 'fastify' {
  interface FastifyRequest {
    // Raw request bytes, captured before JSON parsing so webhook HMAC
    // signatures can be verified over the exact payload the gateway signed.
    rawBody?: Buffer;
  }
}

const app = Fastify({ logger: true });

app.addHook('preParsing', async (request, _reply, payload) => {
  const chunks: Buffer[] = [];
  for await (const chunk of payload) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks);
  request.rawBody = raw;
  return Readable.from(raw);
});

const configuredOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// The app is commonly opened through localhost, 127.0.0.1, or a LAN address.
// Browsers send that page origin on every API request, so all local variants
// must pass CORS even though the backend itself always runs on port 4000.
function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.localhost') ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  } catch {
    return false;
  }
}

await app.register(cors, {
  origin: (origin, callback) => {
    // No Origin header means a same-origin or non-browser request.
    if (!origin) return callback(null, true);
    if (configuredOrigins.includes(origin) || isLocalOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
});

app.get('/api/health', async () => ({
  ok: true,
  time: new Date().toISOString(),
}));

await app.register(feeRoutes);
await app.register(authRoutes);
await app.register(whatsappRoutes);
await app.register(collectionsRoutes);
await app.register(paymentRoutes);
await app.register(paymentSettingsRoutes);
await app.register(businessProfileRoutes);

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
    CREATE TABLE IF NOT EXISTS students (
      student_id VARCHAR(30) PRIMARY KEY,
      student_name VARCHAR(200) NOT NULL,
      dob TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      guardian TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      class_group TEXT NOT NULL DEFAULT '',
      course TEXT NOT NULL DEFAULT '',
      joining_date TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active'
    );
    CREATE TABLE IF NOT EXISTS student_groups (
      group_id VARCHAR(30) PRIMARY KEY,
      group_name VARCHAR(200) NOT NULL,
      course TEXT NOT NULL DEFAULT '',
      batch TEXT NOT NULL DEFAULT '',
      fee_amount TEXT NOT NULL DEFAULT '',
      fee_frequency TEXT NOT NULL DEFAULT 'Monthly',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      student_ids TEXT[] NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS fee_structures (
      structure_id VARCHAR(30) PRIMARY KEY,
      structure_name VARCHAR(200) NOT NULL,
      course_group TEXT NOT NULL DEFAULT '',
      fee_type TEXT NOT NULL DEFAULT 'Tuition Fee',
      amount TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL DEFAULT 'Monthly',
      due_date TEXT NOT NULL DEFAULT '',
      late_fee TEXT NOT NULL DEFAULT '',
      payment_methods TEXT[] NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'Active',
      description TEXT NOT NULL DEFAULT '',
      student_ids TEXT[] NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS receipts (
      receipt_id VARCHAR(30) PRIMARY KEY,
      student_id TEXT NOT NULL DEFAULT '',
      student_name TEXT NOT NULL DEFAULT '',
      amount TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT 'Cash',
      payment_date TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Paid',
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS announcements (
      announcement_id VARCHAR(30) PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      recipient_ids TEXT[] NOT NULL DEFAULT '{}',
      recipient_names TEXT[] NOT NULL DEFAULT '{}',
      sent_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Sent',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payment_orders (
      order_id VARCHAR(64) PRIMARY KEY,
      payment_id VARCHAR(64),
      student_id TEXT NOT NULL DEFAULT '',
      student_name TEXT NOT NULL DEFAULT '',
      fee_id INTEGER,
      amount TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'INITIATED',
      gateway_status TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      utr TEXT NOT NULL DEFAULT '',
      checkout_url TEXT NOT NULL DEFAULT '',
      receipt_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS receipt_id TEXT;
    ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS gateway_status TEXT NOT NULL DEFAULT '';
    ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS payment_events (
      id BIGSERIAL PRIMARY KEY,
      order_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL,
      gateway_status VARCHAR(32) NOT NULL DEFAULT '',
      method VARCHAR(32) NOT NULL DEFAULT '',
      source VARCHAR(32) NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS payment_events_order_idx
      ON payment_events (order_id, created_at);
    CREATE TABLE IF NOT EXISTS payment_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      upi_id TEXT NOT NULL DEFAULT '',
      payee_name TEXT NOT NULL DEFAULT '',
      qr_code_data_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dropdown_options (
      list_key TEXT PRIMARY KEY,
      options TEXT[] NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS business_profiles (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed default login user (PostgreSQL) if missing.
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [SEED_EMAIL]);
  if (existing.rowCount === 0) {
    const hash = await bcrypt.hash(SEED_PASSWORD, 10);
    await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [SEED_EMAIL, hash]);
  }

  // Seed demo fees (mirrors sql/init.sql) if the table is empty.
  const feeCount = await pool.query('SELECT COUNT(*)::int AS n FROM fees');
  if (Number((feeCount.rows[0] as any)?.n ?? 0) === 0) {
    await pool.query(
      `INSERT INTO fees (student_name, amount, status, due_date) VALUES
        ('Aarav Sharma', 2500.00, 'pending', CURRENT_DATE + INTERVAL '7 days'),
        ('Diya Patel', 3200.50, 'paid', CURRENT_DATE - INTERVAL '2 days'),
        ('Kabir Singh', 1800.00, 'overdue', CURRENT_DATE - INTERVAL '5 days')`
    );
  }

  // Seed default dropdown options if none are stored.
  const ddCount = await pool.query('SELECT COUNT(*)::int AS n FROM dropdown_options');
  if (Number((ddCount.rows[0] as any)?.n ?? 0) === 0) {
    const defaults: Record<string, string[]> = {
      gender: ['Male', 'Female', 'Other'],
      classGroup: ['Class 1', 'Class 2', 'Class 3', 'Group A', 'Group B'],
      course: ['Science', 'Commerce', 'Arts', 'General'],
      studentStatus: ['Active', 'Inactive'],
      feeFrequency: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-Time'],
      feeType: ['Tuition Fee', 'Admission Fee', 'Exam Fee', 'Transport Fee', 'Library Fee', 'Hostel Fee', 'Other'],
      paymentMethod: ['Cash', 'UPI', 'Bank Transfer'],
      receiptStatus: ['Paid', 'Pending', 'Cancelled'],
    };
    for (const [key, options] of Object.entries(defaults)) {
      await pool.query(
        'INSERT INTO dropdown_options (list_key, options) VALUES ($1, $2) ON CONFLICT (list_key) DO NOTHING',
        [key, options]
      );
    }
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
