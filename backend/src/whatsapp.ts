/**
 * WhatsApp engine powered by Baileys (https://github.com/WhiskeySockets/Baileys).
 *
 * Talks to WhatsApp directly over WebSocket — NO browser needed. Replaces the
 * old whatsapp-web.js + Puppeteer/Chromium setup that needed ~400 MB of RAM
 * and took ~26s to boot per connection; Baileys runs in a few tens of MB and
 * connects in seconds.
 *
 * The exported API is identical to the previous engine, so every route keeps
 * working unchanged: getWaState / startWa / logoutWa / sendWaMessage /
 * normalizeWaNumber.
 */
import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers,
} = require('@whiskeysockets/baileys') as any;
const pino = require('pino') as (opts: unknown) => any;

// Keep Baileys protocol logs off — they are enormous and useless in journald.
const logger = (pino as any)({ level: 'silent' });

const AUTH_DIR = '.baileys_auth';

export type WaStatus =
  | 'idle'
  | 'starting'
  | 'qr'
  | 'ready'
  | 'disconnected'
  | 'error';

let sock: any | null = null;
let status: WaStatus = 'idle';
let qrDataUrl: string | null = null;
let connectedNumber: string | null = null;
let lastError: string | null = null;
let starting = false;
let restartAttempts = 0;

/**
 * Delete the paired session from disk. Needed whenever the phone revokes the
 * browser (LOGOUT / auth failure): the saved credentials are dead and any
 * reconnect would loop forever on them.
 */
function purgeWaSession() {
  try {
    rmSync(AUTH_DIR, { recursive: true, force: true });
    console.log('[wa] stale auth session purged');
  } catch (err: any) {
    console.log(`[wa] could not purge auth session: ${err?.message ?? err}`);
  }
}

export function getWaState() {
  return {
    status,
    hasQr: qrDataUrl !== null,
    qr: qrDataUrl,
    connectedNumber,
    lastError,
  };
}

/** Milliseconds to wait before a fresh start attempt (exponential-ish). */
function restartDelayMs(): number {
  return Math.min(60_000, 2_000 * Math.pow(2, restartAttempts));
}

function armInitWatchdog() {
  // If no QR and no connection within the window, surface an explicit error
  // instead of leaving the UI spinning on "connecting" forever.
  const t = setTimeout(() => {
    if ((status === 'starting' || status === 'idle') && !starting) return;
    if (status !== 'starting') return;
    status = 'error';
    lastError =
      'WhatsApp boot timed out (network unreachable or WhatsApp servers unreachable). Connect again to retry.';
    starting = false;
    const dead = sock;
    sock = null;
    try {
      void (async () => {
        await dead?.end(undefined);
      })().catch(() => undefined);
    } catch {
      // ignore
    }
  }, Math.max(30_000, Number(process.env.WA_INIT_TIMEOUT_MS ?? 90_000)));
  (t as { unref?: () => void }).unref?.();
}

interface ConnUpdate {
  connection?: string;
  qr?: string;
  lastDisconnect?: { error?: any };
}

async function handleConnectionUpdate(update: ConnUpdate) {
  if (update.qr) {
    try {
      qrDataUrl = await QRCode.toDataURL(update.qr);
      status = 'qr';
      starting = false; // QR is on screen; pairing can now happen at any time
    } catch (err: any) {
      lastError = err?.message ?? 'Failed to render QR';
    }
    return;
  }

  if (update.connection === 'open') {
    status = 'ready';
    qrDataUrl = null;
    lastError = null;
    starting = false;
    restartAttempts = 0;
    try {
      // user.id looks like "916374984055:12@s.whatsapp.net"
      connectedNumber =
        String(sock?.user?.id ?? '').split(':')[0].replace(/@.*/, '') || null;
    } catch {
      connectedNumber = null;
    }
    return;
  }

  if (update.connection === 'close') {
    const code =
      update.lastDisconnect?.error?.output?.statusCode ??
      update.lastDisconnect?.error?.code ??
      null;
    starting = false;
    qrDataUrl = null;
    connectedNumber = null;

    const loggedOut =
      code === DisconnectReason.loggedOut ||
      code === 401 ||
      code === 403 ||
      code === DisconnectReason.badSession;

    if (loggedOut) {
      // The phone revoked/invalidated this session. Purge and come back with
      // a fresh QR automatically.
      lastError = typeof code === 'number' ? `LOGOUT (${code})` : 'LOGOUT';
      status = 'disconnected';
      const dead = sock;
      sock = null;
      purgeWaSession();
      try {
        void (async () => {
          await dead?.end(undefined);
        })().catch(() => undefined);
      } catch {
        // ignore
      }
      setTimeout(() => {
        void startWa();
      }, 1_500).unref?.();
      return;
    }

    // Transient disconnect (515 restart-required after pairing, 440 connection
    // replaced, network drops...). Backoff-reconnect without touching the
    // valid session on disk.
    restartAttempts += 1;
    if (restartAttempts > 6) {
      status = 'error';
      lastError = `Repeated connection failures (code ${code ?? 'unknown'}) — connect again to retry.`;
      const dead = sock;
      sock = null;
      try {
        void (async () => {
          await dead?.end(undefined);
        })().catch(() => undefined);
      } catch {
        // ignore
      }
      return;
    }
    status = 'starting'; // a reconnect is already scheduled
    setTimeout(() => {
      void startWa();
    }, restartDelayMs()).unref?.();
  }
}

export async function startWa() {
  if (status === 'ready' || starting) return getWaState();
  starting = true;
  status = 'starting';
  lastError = null;

  // A previous socket may still be half-alive after an error or disconnect.
  // Tear it (and its listeners) down before creating a new one.
  if (sock) {
    try {
      sock.ev?.removeAllListeners?.('connection.update');
      sock.ev?.removeAllListeners?.('creds.update');
      await sock.end(undefined);
    } catch {
      // stale socket may be half-dead; the TCP side dies either way
    }
    sock = null;
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();
    sock = makeWASocket({
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
      markOnlineOnConnect: false,
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update: ConnUpdate) => {
      void handleConnectionUpdate(update);
    });
    armInitWatchdog();
  } catch (err: any) {
    status = 'error';
    lastError = err?.message ?? 'Failed to start WhatsApp client';
    starting = false;
    sock = null;
  } finally {
    if (status !== 'starting') starting = false;
  }

  return getWaState();
}

export async function logoutWa() {
  try {
    await sock?.logout();
  } catch {
    // ignore — socket may already be logged out
  }
  try {
    await sock?.end(undefined);
  } catch {
    // ignore
  }
  sock = null;
  starting = false;
  status = 'disconnected';
  qrDataUrl = null;
  connectedNumber = null;
  // logout() revokes the pairing, so the stored session is dead on disk too.
  purgeWaSession();
  return getWaState();
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

export interface WaAttachment {
  name: string;
  mime: string;
  /** base64 payload (no data: URL prefix) */
  data: string;
}

// ---------------------------------------------------------------------------
// Global anti-ban send queue
//
// Every outbound message (reminders, announcements, custom sends) is funneled
// through one serialized queue that enforces a minimum spacing between sends
// plus random jitter. Mass-sending in a tight loop is the #1 reason WhatsApp
// flags business accounts; the queue makes bursts physically impossible and
// spreads them out so nothing needs to be sent "instantly".
// ---------------------------------------------------------------------------

const WA_SEND_GAP_MS = Math.min(
  60_000,
  Math.max(0, Number(process.env.WA_SEND_GAP_MS ?? 8_000))
); // minimum spacing between two messages
const WA_SEND_JITTER_MS = Math.min(
  60_000,
  Math.max(0, Number(process.env.WA_SEND_JITTER_MS ?? 7_000))
); // extra random spacing

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let sendChain: Promise<unknown> = Promise.resolve();
let lastSentAt = 0;

function enqueueSend<T>(fn: () => Promise<T>): Promise<T> {
  const run = sendChain.then(async () => {
    const minNext = lastSentAt + WA_SEND_GAP_MS + Math.random() * WA_SEND_JITTER_MS;
    const wait = minNext - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      lastSentAt = Date.now();
    }
  });
  // Never poison the chain for later senders.
  sendChain = run.catch(() => undefined);
  return run as Promise<T>;
}

async function performSend(
  jid: string,
  message: string,
  attachments: WaAttachment[]
): Promise<{ id: string | null }> {
  const s = sock;
  if (!s) throw new Error('WhatsApp socket is gone');
  let firstId: string | null = null;
  if (message.trim()) {
    const sent = await s.sendMessage(jid, { text: message });
    firstId = sent?.key?.id ?? null;
  }
  for (const att of attachments) {
    const buf = Buffer.from(att.data, 'base64');
    const sent = await s.sendMessage(
      jid,
      att.mime.startsWith('image/')
        ? { image: buf, caption: att.name }
        : att.mime.startsWith('video/')
          ? { video: buf, mimetype: att.mime, fileName: att.name }
          : { document: buf, mimetype: att.mime, fileName: att.name }
    );
    firstId = firstId ?? sent?.key?.id ?? null;
  }
  return { id: firstId };
}

export async function sendWaMessage(
  to: string,
  message: string,
  attachments: WaAttachment[] = []
) {
  if (!sock || status !== 'ready') {
    const err = new Error(
      'WhatsApp is not connected. Scan the QR code on the Settings page first.'
    ) as Error & { statusCode?: number };
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

  // Funnel through the global paced queue so concurrent callers (cron run,
  // announcements, manual sends) can never burst-line WhatsApp.
  try {
    return await enqueueSend(() => performSend(jid, message, attachments));
  } catch (err: any) {
    // Connection lost mid-queue: surface as 409 so callers show "not
    // connected" instead of a raw protocol error.
    if (status !== 'ready') {
      err.statusCode = 409;
      throw new Error(
        `WhatsApp connection dropped while sending to +${jidToPhone(jid)}. Reconnect and try again.`
      );
    }
    throw err;
  }
}
