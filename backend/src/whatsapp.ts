/**
 * WhatsApp engine powered by Baileys (https://github.com/WhiskeySockets/Baileys).
 *
 * Talks to WhatsApp directly over WebSocket — NO browser needed. Replaces the
 * old whatsapp-web.js + Puppeteer/Chromium setup that needed ~400 MB of RAM
 * and took ~26s to boot per connection; Baileys runs in a few tens of MB and
 * connects in seconds.
 *
 * EVERY signed-in user account owns an ISOLATED WhatsApp session:
 *   - its own Baileys auth dir on disk (one folder per user key)
 *   - its own socket / QR code / status / reconnect timer
 *   - its own paced send queue
 * A user's reminders, announcements and receipts are only ever delivered
 * through that user's OWN connected WhatsApp number — user A's session is never
 * used by user B (and vice versa).
 *
 * System-level senders (cron-job.org, the queue worker, the payment-gateway
 * bridge, signed webhooks) carry no user session, so they fall back to the
 * fixed super admin session key.
 *
 * The exported API is: getWaState / startWa / logoutWa / sendWaMessage /
 * normalizeWaNumber / waSessionKeyFor — every caller passes the acting user's
 * session key (or none, for system-level sends).
 */
import { rmSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
  proto,
  generateWAMessageFromContent,
} = require('@whiskeysockets/baileys') as any;
const pino = require('pino') as (opts: unknown) => any;

// Keep Baileys protocol logs off — they are enormous and useless in journald.
const logger = (pino as any)({ level: 'silent' });

const AUTH_DIR = process.env.WA_AUTH_DIR
  ? path.resolve(process.env.WA_AUTH_DIR)
  : path.resolve(process.cwd(), '.baileys_auth');

if (!existsSync(AUTH_DIR)) {
  try {
    mkdirSync(AUTH_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

// Older builds persisted the E2EE message cache to disk. Purge that file so no
// WhatsApp content is left on the server outside Appwrite.
try {
  const legacyMessages = path.join(AUTH_DIR, 'recent_messages.json');
  if (existsSync(legacyMessages)) rmSync(legacyMessages, { force: true });
} catch {
  // ignore
}

// Migrate the legacy single-session auth folder (created before per-user
// sessions existed) into the fixed super-admin session folder so the existing
// pairing is not lost on upgrade.
try {
  const legacyCreds = path.join(AUTH_DIR, 'creds.json');
  if (existsSync(legacyCreds)) {
    const targetDir = authDirFor(
      process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || 'developer@myenum.in'
    );
    const legacySignalNames = ['app-state-sync-key-1.json', 'app-state-sync-key-2.json'];
    const destCreds = path.join(targetDir, 'creds.json');
    const destSignals = legacySignalNames.map((n) => path.join(targetDir, n));
    if (!existsSync(destCreds)) {
      copyFileSync(legacyCreds, destCreds);
      for (const name of legacySignalNames) {
        const src = path.join(AUTH_DIR, name);
        if (existsSync(src)) copyFileSync(src, path.join(targetDir, name));
      }
    }
    rmSync(legacyCreds, { force: true });
  }
} catch {
  // ignore — fall back to a fresh pairing flow
}

export type WaStatus =
  | 'idle'
  | 'starting'
  | 'qr'
  | 'ready'
  | 'disconnected'
  | 'error';

/** Per-user WhatsApp session handle. Keyed by normalized account email. */
export interface WaSession {
  sock: any | null;
  status: WaStatus;
  qrDataUrl: string | null;
  connectedNumber: string | null;
  lastError: string | null;
  starting: boolean;
  restartAttempts: number;
  reconnectTimer: any;
}

function newSession(): WaSession {
  return {
    sock: null,
    status: 'idle',
    qrDataUrl: null,
    connectedNumber: null,
    lastError: null,
    starting: false,
    restartAttempts: 0,
    reconnectTimer: null,
  };
}

const sessions = new Map<string, WaSession>();

function sanitizeSessionKey(key: string): string {
  const clean = String(key ?? '')
    .trim()
    .toLowerCase();
  const safe = clean.replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return safe || 'default';
}

/**
 * Resolve the session key for an account. Falls back to the fixed super admin
 * session when no account email is present (system senders: cron, worker,
 * gateway bridge, signed webhooks).
 */
export function waSessionKeyFor(email?: string | null): string {
  const clean = String(email ?? '').trim().toLowerCase();
  if (clean) return clean;
  const fallback =
    process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    'developer@myenum.in';
  return sanitizeSessionKey(fallback);
}

function authDirFor(key: string): string {
  const dir = path.join(AUTH_DIR, sanitizeSessionKey(key) || 'default');
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
    // ignore — Baileys will surface the real error if the dir is unusable
  }
  return dir;
}

/** True when this account has a paired WhatsApp session saved on disk. */
export function hasWaCredentials(userKey?: string | null): boolean {
  try {
    return existsSync(path.join(authDirFor(waSessionKeyFor(userKey)), 'creds.json'));
  } catch {
    return false;
  }
}

function getSession(userKey?: string | null): WaSession {
  const key = waSessionKeyFor(userKey);
  let session = sessions.get(key);
  if (!session) {
    session = newSession();
    sessions.set(key, session);
  }
  return session;
}

// ---------------------------------------------------------------------------
// E2EE retry caches
// Prevents "Waiting for this message. This may take a while" by answering
// Signal protocol retry requests when WhatsApp recipients need session keys.
// These caches are process-local on purpose: the app's business data lives in
// Appwrite, and no message content is written to the server filesystem.
// ---------------------------------------------------------------------------
const NodeCache = require('node-cache');
const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
const userDevicesCache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 });
const messageStore = new NodeCache({ stdTTL: 14 * 86400, checkperiod: 3600 });

function hasActualContent(msg: any): boolean {
  if (!msg || typeof msg !== 'object') return false;
  return Boolean(
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage ||
    msg.documentMessage ||
    msg.videoMessage ||
    msg.audioMessage
  );
}

function persistMessage(keyId: string, remoteJid: string, messageProto: any) {
  if (!keyId || !messageProto || !hasActualContent(messageProto)) return;
  messageStore.set(keyId, messageProto);
  if (remoteJid) {
    messageStore.set(`${remoteJid}:${keyId}`, messageProto);
  }
}

/**
 * Delete the paired session from disk. ONLY called when the user explicitly
 * clicks "Log out" for THEIR OWN session in the Settings UI. Never called on
 * transient disconnects.
 */
function purgeWaSession(key: string) {
  try {
    rmSync(authDirFor(key), { recursive: true, force: true });
    console.log(`[wa] auth session purged for ${key}`);
  } catch (err: any) {
    console.log(`[wa] could not purge auth session for ${key}: ${err?.message ?? err}`);
  }
}

export function getWaState(userKey?: string | null) {
  const key = waSessionKeyFor(userKey);
  const session = getSession(key);
  return {
    status: session.status,
    hasQr: session.qrDataUrl !== null,
    qr: session.qrDataUrl,
    connectedNumber: session.connectedNumber,
    lastError: session.lastError,
    /** The WhatsApp session key (account email) this state belongs to. */
    sessionKey: key,
  };
}

interface ConnUpdate {
  connection?: string;
  qr?: string;
  lastDisconnect?: { error?: any };
}

function clearReconnectTimer(session: WaSession) {
  if (session.reconnectTimer) {
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
  }
}

function scheduleReconnect(session: WaSession, key: string, code: number | null, reason: string) {
  session.restartAttempts += 1;
  // Exponential backoff capped at 30 seconds
  const delay = Math.min(30_000, 2_000 * Math.pow(1.5, Math.min(session.restartAttempts, 8)));
  session.status = 'starting';
  session.lastError = `Connection closed (${code ?? 'unknown'}). Reconnecting in ${Math.round(delay / 1000)}s...`;

  console.log(
    `[wa] WhatsApp (${key}) connection closed (code: ${code}, reason: ${reason}) — scheduling reconnect #${session.restartAttempts} in ${Math.round(delay / 1000)}s...`
  );
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  session.reconnectTimer = setTimeout(() => {
    void startWa(key);
  }, delay);
  session.reconnectTimer.unref?.();
}

async function handleConnectionUpdate(update: ConnUpdate, key: string) {
  const session = getSession(key);

  if (update.qr) {
    try {
      session.qrDataUrl = await QRCode.toDataURL(update.qr);
      session.status = 'qr';
      session.starting = false; // QR is on screen; pairing can now happen at any time
      console.log(`[wa] (${key}) New QR code generated for scanning in Settings`);
    } catch (err: any) {
      session.lastError = err?.message ?? 'Failed to render QR';
    }
    return;
  }

  if (update.connection === 'open') {
    session.status = 'ready';
    session.qrDataUrl = null;
    session.lastError = null;
    session.starting = false;
    session.restartAttempts = 0;
    try {
      // user.id looks like "916374984055:12@s.whatsapp.net"
      session.connectedNumber =
        String(session.sock?.user?.id ?? '').split(':')[0].replace(/@.*/, '') || null;
    } catch {
      session.connectedNumber = null;
    }
    console.log(`[wa] WhatsApp (${key}) connection open! Connected as +${session.connectedNumber ?? 'unknown'}`);
    return;
  }

  if (update.connection === 'close') {
    const error = update.lastDisconnect?.error;
    const code =
      error?.output?.statusCode ??
      error?.code ??
      error?.statusCode ??
      null;
    const reason = error?.message ?? String(error ?? 'connection closed');
    session.starting = false;
    session.qrDataUrl = null;
    session.connectedNumber = null;

    console.log(`[wa] WhatsApp (${key}) Connection closed (code: ${code}, reason: ${reason})`);

    const dead = session.sock;
    session.sock = null;
    try {
      void (async () => {
        await dead?.end(undefined);
      })().catch(() => undefined);
    } catch {
      // ignore
    }

    // CRITICAL: We NEVER call purgeWaSession() on disconnect!
    // The session credentials stay safely stored on disk in the per-user auth
    // dir. If the phone revoked the session, Baileys will automatically emit a
    // new QR.

    scheduleReconnect(session, key, code, reason);
  }
}

export async function startWa(userKey?: string | null) {
  const key = waSessionKeyFor(userKey);
  const session = getSession(key);

  if (session.status === 'ready' && session.sock) return getWaState(key);
  if (session.starting) return getWaState(key);
  session.starting = true;
  session.status = 'starting';
  session.lastError = null;

  clearReconnectTimer(session);

  // A previous socket may still be half-alive after an error or disconnect.
  // Tear it (and its listeners) down before creating a new one.
  if (session.sock) {
    try {
      session.sock.ev?.removeAllListeners?.('connection.update');
      session.sock.ev?.removeAllListeners?.('creds.update');
      await session.sock.end(undefined);
    } catch {
      // stale socket may be half-dead; the TCP side dies either way
    }
    session.sock = null;
  }

  const authDir = authDirFor(key);
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    let version: [number, number, number] = [2, 3000, 1043857760];
    try {
      const fetched = await fetchLatestBaileysVersion();
      if (fetched?.version) version = fetched.version;
    } catch (e: any) {
      console.log(`[wa] fetchLatestBaileysVersion fallback used: ${e?.message ?? e}`);
    }

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: Browsers.ubuntu('Chrome'),
      // We render the QR in the web UI ourselves.
      printQRInTerminal: false,
      logger,
      syncFullHistory: false,
      // Tell WhatsApp not to transfer past chat history: prevents "Sync is paused" on the phone
      shouldSyncHistoryMessage: () => false,
      msgRetryCounterCache,
      userDevicesCache,
      getMessage: async (key: any) => {
        const id = key?.id;
        const remoteJid = key?.remoteJid;
        if (id) {
          const cached =
            messageStore.get(id) ||
            (remoteJid ? messageStore.get(`${remoteJid}:${id}`) : undefined);
          if (cached && hasActualContent(cached)) {
            console.log(`[wa] getMessage: returning stored message for ${remoteJid || id}:${id}`);
            return proto.Message.fromObject(cached);
          }
        }
        return proto.Message.fromObject({});
      },
      markOnlineOnConnect: true,
      keepAliveIntervalMs: 20_000,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 5,
    });

    session.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update: ConnUpdate) => {
      void handleConnectionUpdate(update, key);
    });
    sock.ev.on('messages.upsert', ({ messages }: { messages: any[] }) => {
      for (const m of messages || []) {
        if (m.key?.id && m.message && Object.keys(m.message).length > 0) {
          persistMessage(m.key.id, m.key.remoteJid || '', m.message);
        }
      }
    });
    sock.ev.on('messaging-history.set', () => {
      console.log('[wa] history sync acknowledged');
    });
  } catch (err: any) {
    session.status = 'error';
    session.lastError = err?.message ?? 'Failed to start WhatsApp client';
    session.starting = false;
    session.sock = null;
    console.error(`[wa] Error starting WhatsApp socket for ${key}:`, err);
  } finally {
    session.starting = false;
  }

  return getWaState(key);
}

export async function logoutWa(userKey?: string | null) {
  const key = waSessionKeyFor(userKey);
  const session = getSession(key);
  console.log(`[wa] (${key}) Manual logout initiated by user`);

  clearReconnectTimer(session);
  try {
    await session.sock?.logout();
  } catch {
    // ignore — socket may already be logged out
  }
  try {
    await session.sock?.end(undefined);
  } catch {
    // ignore
  }
  session.sock = null;
  session.starting = false;
  session.status = 'disconnected';
  session.qrDataUrl = null;
  session.connectedNumber = null;
  session.lastError = 'Logged out by user. Click "Restart client" or scan QR to reconnect.';
  // User explicitly logged out: delete disk credentials so fresh QR can generate
  purgeWaSession(key);
  return getWaState(key);
}

/**
 * Normalize a phone number for the WhatsApp JID:
 * bare 10-digit Indian numbers get the default `91` country code, since
 * without it the session cannot resolve the contact and sends fail.
 */
export function normalizeWaNumber(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  return digits;
}

/** Strip the device suffix from a JID: "919876543210:12@s.whatsapp.net" -> digits. */
function jidToPhone(jid: string): string {
  return String(jid).split('@')[0].split(':')[0];
}

export interface WaCtaUrl {
  displayText: string;
  url: string;
}

export interface WaAttachment {
  name: string;
  mime: string;
  /** base64 payload (no data: URL prefix) */
  data: string;
}

// ---------------------------------------------------------------------------
// Global anti-ban send queue (per WhatsApp session)
//
// Every outbound message (reminders, announcements, custom sends) is funneled
// through a serialized queue that enforces a minimum spacing between sends plus
// random jitter. Mass-sending in a tight loop is the #1 reason WhatsApp flags
// business accounts; the queue makes bursts physically impossible and spreads
// them out so nothing needs to be sent "instantly". Each user session keeps its
// own queue so different users' numbers never pace against each other.
// ---------------------------------------------------------------------------

const WA_SEND_GAP_MS = Math.min(
  60_000,
  Math.max(0, Number(process.env.WA_SEND_GAP_MS ?? 1_200))
); // fast anti-flood spacing (1.2s)
const WA_SEND_JITTER_MS = Math.min(
  60_000,
  Math.max(0, Number(process.env.WA_SEND_JITTER_MS ?? 800))
); // fast random jitter (0.8s)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const sendChains = new Map<string, Promise<unknown>>();
const lastSentAtByKey = new Map<string, number>();

function enqueueSend<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (sendChains.get(key) ?? Promise.resolve()).then(async () => {
    const minNext = (lastSentAtByKey.get(key) ?? 0) + WA_SEND_GAP_MS + Math.random() * WA_SEND_JITTER_MS;
    const wait = minNext - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      lastSentAtByKey.set(key, Date.now());
    }
  });
  // Never poison the chain for later senders.
  sendChains.set(key, run.catch(() => undefined) as Promise<unknown>);
  return run as Promise<T>;
}

/**
 * Interactive CTA-URL message — the WhatsApp "Tap the button to open the
 * link" bubble. Wrapped in viewOnceMessage so Baileys routes it to the
 * native-flow encoder. Renders natively on current WhatsApp clients; older
 * clients simply show the body text.
 */
function buildCtaUrlMessage(jid: string, body: string, footer: string, cta: WaCtaUrl) {
  return generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({
              text: body,
            }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: footer,
            }),
            header: proto.Message.InteractiveMessage.Header.create({
              hasMediaAttachment: false,
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: [
                {
                  name: 'cta_url',
                  buttonParamsJson: JSON.stringify({
                    display_text: cta.displayText,
                    url: cta.url,
                    merchant_url: cta.url,
                  }),
                },
              ],
            }),
          }),
        },
      },
    },
    { userJid: jid }
  );
}

async function performSend(
  sock: any,
  jid: string,
  message: string,
  attachments: WaAttachment[],
  cta?: WaCtaUrl
): Promise<{ id: string | null }> {
  if (!sock) throw new Error('WhatsApp socket is gone');
  let firstId: string | null = null;

  const plainText = message.trim();

  // Format message text, appending CTA link if present.
  // We use standard WhatsApp text messages (sock.sendMessage) because interactive
  // nativeFlowMessage buttons are silently dropped by Meta WhatsApp clients
  // on iOS/Android when sent from non-business Web companion devices.
  let textToSend = plainText;
  if (cta && cta.url) {
    const ctaSection = `\n\n💳 *${cta.displayText || 'Pay Now'}:*\n👉 ${cta.url}`;
    if (!textToSend) {
      textToSend = `💳 *${cta.displayText || 'Pay Now'}:*\n👉 ${cta.url}`;
    } else if (!textToSend.includes(cta.url)) {
      textToSend = `${textToSend}${ctaSection}`;
    }
  }

  if (textToSend) {
    const protoPayload = {
      conversation: textToSend,
      extendedTextMessage: { text: textToSend },
    };
    const sent = await sock.sendMessage(jid, { text: textToSend });
    firstId = sent?.key?.id ?? null;
    if (firstId) {
      persistMessage(firstId, jid, protoPayload);
    }
    console.log(`[wa] Sent text message to ${jid} (id: ${firstId})`);
  }

  for (const att of attachments) {
    const buf = Buffer.from(att.data, 'base64');
    const sent = await sock.sendMessage(
      jid,
      att.mime.startsWith('image/')
        ? { image: buf, caption: att.name }
        : att.mime.startsWith('video/')
          ? { video: buf, mimetype: att.mime, fileName: att.name }
          : { document: buf, mimetype: att.mime, fileName: att.name }
    );
    firstId = firstId ?? sent?.key?.id ?? null;
    if (sent?.key?.id && sent.message) {
      persistMessage(sent.key.id, jid, sent.message);
    }
    console.log(`[wa] Sent attachment ${att.name} to ${jid}`);
  }

  return { id: firstId };
}

function waitForReady(userKey: string, maxWaitMs: number): Promise<boolean> {
  const session = getSession(userKey);
  if (session.status === 'ready' && session.sock) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const s = getSession(userKey);
      if (s.status === 'ready' && s.sock) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start >= maxWaitMs || s.status === 'error' || s.status === 'qr') {
        clearInterval(interval);
        resolve(false);
      }
    }, 250);
    (interval as any).unref?.();
  });
}

export async function sendWaMessage(
  to: string,
  message: string,
  attachments: WaAttachment[] = [],
  cta?: WaCtaUrl,
  userKey?: string | null
) {
  const key = waSessionKeyFor(userKey);
  const session = getSession(key);

  // If socket is starting or reconnecting, wait briefly for connection to open
  if (session.status === 'starting' || (!session.sock && session.status !== 'qr' && session.status !== 'error')) {
    await waitForReady(key, 7_000);
  }

  if (!session.sock || session.status !== 'ready') {
    const hint =
      session.status === 'qr'
        ? 'WhatsApp is not connected. Scan the QR code on the Settings page first.'
        : session.status === 'starting'
          ? 'WhatsApp client is currently connecting. Please try again in a few moments.'
          : `WhatsApp is not connected (status: ${session.status}). Scan the QR code on the Settings page first.`;
    const err = new Error(hint) as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }
  const digits = normalizeWaNumber(to);
  if (digits.length < 10 || digits.length > 15) {
    const err = new Error(
      'Invalid phone number. Use international format with country code, e.g. 919876543210.'
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  const jid = `${digits}@s.whatsapp.net`;

  // Funnel through the per-session paced queue so concurrent callers (cron
  // run, announcements, manual sends) can never burst-line WhatsApp.
  try {
    return await enqueueSend(key, () => performSend(session.sock, jid, message, attachments, cta));
  } catch (err: any) {
    // Connection lost mid-queue: surface as 409 so callers show "not
    // connected" instead of a raw protocol error.
    if (getSession(key).status !== 'ready') {
      err.statusCode = 409;
      throw new Error(
        `WhatsApp connection dropped while sending to +${jidToPhone(jid)}. Reconnect and try again.`
      );
    }
    throw err;
  }
}
