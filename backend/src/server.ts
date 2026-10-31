import './env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Readable } from 'node:stream';
import {
  assertAppwriteSetup,
  getAppwriteStatus,
  isAppwriteConfigured,
} from './appwrite.js';
import { authGuard } from './auth.js';
import {
  ensureAccountsAndProfiles,
  listProfiles,
  migrateLegacyData,
  seedProfileDefaults,
} from './profiles.js';
import { feeRoutes } from './routes/fees.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { profileRoutes } from './routes/profiles.js';
import { whatsappRoutes } from './routes/whatsapp.js';
import { queueRoutes } from './routes/queue.js';
import { collectionsRoutes } from './routes/collections.js';
import { paymentRoutes } from './routes/payments.js';
import { paymentSettingsRoutes } from './routes/payment-settings.js';
import { businessProfileRoutes } from './routes/business-profile.js';
import { reminderRoutes } from './routes/reminders.js';
import { hydrateQueue } from './queue.js';

declare module 'fastify' {
  interface FastifyRequest {
    // Raw request bytes, captured before JSON parsing so webhook HMAC
    // signatures can be verified over the exact payload the gateway signed.
    rawBody?: Buffer;
  }
}

// Merchant QR uploads are stored as data URLs (up to ~3.5M chars), so the
// default 1 MiB Fastify body limit is too small for PUT /api/payments/settings.
const app = Fastify({ logger: true, bodyLimit: 8 * 1024 * 1024 });

// Tolerate empty JSON bodies: curl/Invoke-RestMethod/cron clients often POST
// with Content-Type: application/json and no payload â€” Fastify's default
// parser answers 400 "Body cannot be empty" for those. Treat missing payloads
// as empty objects so routes with no required body just work.
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (_req, body, done) => {
    if (body === '' || body == null) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(String(body)));
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);

// Form-encoded or headerless empty posts (CLI clients, primitives) should be
// treated as empty payloads instead of erroring with 415.
app.addContentTypeParser('application/x-www-form-urlencoded', (_req, _body, done) => {
  done(null, {});
});

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
      : error instanceof Error && error.message.includes('HTTP 402')
      ? 402
      : 500;
  const message = error instanceof Error ? error.message : 'Internal Server Error';
  reply.code(status).send({ error: message });
});

// Authenticate and authorize every /api/* request before it reaches a route.
// Public endpoints (login, first-run setup, health, payment webhook) are
// allow-listed inside the guard.
app.addHook('onRequest', authGuard);

app.get('/api/health', async () => ({
  ok: true,
  time: new Date().toISOString(),
}));

app.get('/api/appwrite/status', async () => ({ data: getAppwriteStatus() }));

await app.register(feeRoutes);
await app.register(authRoutes);
await app.register(userRoutes);
await app.register(profileRoutes);
await app.register(whatsappRoutes);
await app.register(collectionsRoutes);
await app.register(paymentRoutes);
await app.register(paymentSettingsRoutes);
await app.register(businessProfileRoutes);
await app.register(reminderRoutes);
await app.register(queueRoutes);

async function ensureAppwriteSeed(): Promise<void> {
  await assertAppwriteSetup();

  // 1. Ensure the fixed super admin exists and owns the `orgmenu` profile.
  // 2. Give every pre-multi-tenant account its own workspace and backfill the
  //    admin role inside each workspace.
  const legacyProfileId = await ensureAccountsAndProfiles();

  // 3. Move rows written before multi-tenancy into the legacy owner's profile.
  //    The developer profile deliberately never receives these rows.
  if (legacyProfileId) {
    await migrateLegacyData(legacyProfileId);
  }

  // 4. Each workspace gets its own copy of the dropdown defaults.
  const profiles = await listProfiles();
  for (const profile of profiles) {
    await seedProfileDefaults(profile.profileId);
  }

  console.log(
    `Workspaces ready: ${profiles.length} (${profiles
      .map((profile) => profile.profileId)
      .join(', ')})`
  );
}

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

// The WhatsApp engine (whatsapp-web.js + puppeteer) can throw from inside its
// own background callbacks ("Execution context was destroyed", Chromium file
// locks, page reload races). Those rejections escape our try/catch in
// whatsapp.ts because they happen outside the initialize() promise chain.
// Without these guards Node kills the whole API for a browser hiccup.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal-guard] unhandled rejection kept the API alive:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal-guard] uncaught exception kept the API alive:', err);
});

try {
  if (!isAppwriteConfigured()) {
    throw new Error(
      'APPWRITE_API_KEY is required. Add it to backend/.env and restart the backend.'
    );
  }
  await app.listen({ port, host });
  console.log(`Backend listening on http://${host}:${port}`);

  try {
    await ensureAppwriteSeed();
    await hydrateQueue();
    console.log(
      `Appwrite store connected: ${getAppwriteStatus().endpoint} | database ${getAppwriteStatus().databaseId}`
    );
  } catch (seedErr) {
    app.log.error(seedErr, 'Appwrite seed/hydration deferred due to initialization error');
  }

  // Warm the WhatsApp engine at boot: inside startWa the Baileys WebSocket is
  // live ~8s later, so a QR is already waiting in the dashboard right after a
  // deploy/restart instead of showing "connecting" until the first UI poll.
  // Import lazily so the WhatsApp stack can never delay the API's boot.
  const { startWa } = await import('./whatsapp.js');
  void startWa();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
