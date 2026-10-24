import './env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import { Readable } from 'node:stream';
import {
  APPWRITE_COLLECTIONS,
  assertAppwriteSetup,
  getAppwriteStatus,
  getRecord,
  isAppwriteConfigured,
  listRecords,
  putRecord,
} from './appwrite.js';
import type { Fee } from './schemas.js';
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

// Merchant QR uploads are stored as data URLs (up to ~3.5M chars), so the
// default 1 MiB Fastify body limit is too small for PUT /api/payments/settings.
const app = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 });

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

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const status =
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
  const message = error instanceof Error ? error.message : 'Internal Server Error';
  reply.code(status).send({ error: message });
});

app.get('/api/health', async () => ({
  ok: true,
  time: new Date().toISOString(),
}));

app.get('/api/appwrite/status', async () => ({ data: getAppwriteStatus() }));

await app.register(feeRoutes);
await app.register(authRoutes);
await app.register(whatsappRoutes);
await app.register(collectionsRoutes);
await app.register(paymentRoutes);
await app.register(paymentSettingsRoutes);
await app.register(businessProfileRoutes);

const SEED_EMAIL = 'admin@seedsofsuccess.com';
const SEED_PASSWORD = 'Admin123!';

interface UserRecord {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

function isoDateInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function ensureAppwriteSeed(): Promise<void> {
  await assertAppwriteSetup();

  const existingUser = await getRecord<UserRecord>(
    APPWRITE_COLLECTIONS.users,
    SEED_EMAIL
  );
  if (!existingUser) {
    const hash = await bcrypt.hash(SEED_PASSWORD, 10);
    await putRecord<UserRecord>(APPWRITE_COLLECTIONS.users, SEED_EMAIL, {
      id: 1,
      email: SEED_EMAIL,
      password_hash: hash,
      created_at: new Date().toISOString(),
    });
  }

  const fees = await listRecords<Fee>(APPWRITE_COLLECTIONS.fees);
  if (fees.length === 0) {
    const demo: Fee[] = [
      {
        id: 1,
        student_name: 'Aarav Sharma',
        amount: '2500.00',
        status: 'pending',
        due_date: isoDateInDays(7),
        created_at: new Date().toISOString(),
      },
      {
        id: 2,
        student_name: 'Diya Patel',
        amount: '3200.50',
        status: 'paid',
        due_date: isoDateInDays(-2),
        created_at: new Date().toISOString(),
      },
      {
        id: 3,
        student_name: 'Kabir Singh',
        amount: '1800.00',
        status: 'overdue',
        due_date: isoDateInDays(-5),
        created_at: new Date().toISOString(),
      },
    ];
    for (const fee of demo) {
      await putRecord<Fee>(APPWRITE_COLLECTIONS.fees, String(fee.id), fee);
    }
  }

  const dropdowns = await listRecords<string[]>(
    APPWRITE_COLLECTIONS.dropdownOptions
  );
  if (dropdowns.length === 0) {
    const defaults: Record<string, string[]> = {
      gender: ['Male', 'Female', 'Other'],
      classGroup: ['Class 1', 'Class 2', 'Class 3', 'Group A', 'Group B'],
      course: ['Science', 'Commerce', 'Arts', 'General'],
      studentStatus: ['Active', 'Inactive'],
      feeFrequency: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-Time'],
      feeType: [
        'Tuition Fee',
        'Admission Fee',
        'Exam Fee',
        'Transport Fee',
        'Library Fee',
        'Hostel Fee',
        'Other',
      ],
      paymentMethod: ['Cash', 'UPI', 'Bank Transfer'],
      receiptStatus: ['Paid', 'Pending', 'Cancelled'],
    };
    for (const [key, options] of Object.entries(defaults)) {
      await putRecord<string[]>(APPWRITE_COLLECTIONS.dropdownOptions, key, options);
    }
  }
}

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

try {
  if (!isAppwriteConfigured()) {
    throw new Error(
      'APPWRITE_API_KEY is required. Add it to backend/.env and restart the backend.'
    );
  }
  await ensureAppwriteSeed();
  await app.listen({ port, host });
  console.log(`Backend listening on http://${host}:${port}`);
  console.log(
    `Appwrite store connected: ${getAppwriteStatus().endpoint} | database ${getAppwriteStatus().databaseId}`
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
