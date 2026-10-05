import Fastify from 'fastify';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { feeRoutes } from './routes/fees.js';
import { authRoutes } from './routes/auth.js';
import { whatsappRoutes } from './routes/whatsapp.js';
import { collectionsRoutes } from './routes/collections.js';

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
await app.register(collectionsRoutes);

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
    CREATE TABLE IF NOT EXISTS dropdown_options (
      list_key TEXT PRIMARY KEY,
      options TEXT[] NOT NULL DEFAULT '{}'
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
