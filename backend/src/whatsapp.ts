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
import { rmSync, mkdirSync, existsSync } from 'node:fs';
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
let reconnectTimer: any = null;

/**
 * Delete the paired session from disk. ONLY called when the user explicitly
 * clicks "Log out" in the Settings UI. Never called on transient disconnects.
 */
function purgeWaSession() {
  try {
    rmSync(AUTH_DIR, { recursive: true, force: true });
    console.log('[wa] auth session purged from disk');
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
      console.log('[wa] New QR code generated for scanning in Settings');
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
    console.log(`[wa] WhatsApp connection open! Connected as +${connectedNumber ?? 'unknown'}`);
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
    starting = false;
    qrDataUrl = null;
    connectedNumber = null;

    console.log(`[wa] Connection closed (code: ${code}, reason: ${reason})`);

    const dead = sock;
    sock = null;
    try {
      void (async () => {
        await dead?.end(undefined);
      })().catch(() => undefined);
    } catch {
      // ignore
    }

    // CRITICAL: We NEVER call purgeWaSession() on disconnect!
    // The session credentials stay safely stored on disk in .baileys_auth.
    // If phone revoked the session, Baileys will automatically emit a new QR.

    restartAttempts += 1;
    // Exponential backoff capped at 30 seconds
    const delay = Math.min(30_000, 2_000 * Math.pow(1.5, Math.min(restartAttempts, 8)));
    status = 'starting';
    lastError = `Connection closed (${code ?? 'unknown'}). Reconnecting in ${Math.round(delay / 1000)}s...`;

    console.log(`[wa] Scheduling reconnect attempt #${restartAttempts} in ${Math.round(delay / 1000)}s...`);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      void startWa();
    }, delay);
    reconnectTimer.unref?.();
  }
}

export async function startWa() {
  if (status === 'ready' && sock) return getWaState();
  if (starting) return getWaState();
  starting = true;
  status = 'starting';
  lastError = null;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

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
    let version: [number, number, number] = [2, 3000, 1043857760];
    try {
      const fetched = await fetchLatestBaileysVersion();
      if (fetched?.version) version = fetched.version;
    } catch (e: any) {
      console.log(`[wa] fetchLatestBaileysVersion fallback used: ${e?.message ?? e}`);
    }

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
      markOnlineOnConnect: true,
      keepAliveIntervalMs: 25_000,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      retryRequestDelayMs: 500,
      maxMsgRetryCount: 5,
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update: ConnUpdate) => {
      void handleConnectionUpdate(update);
    });
  } catch (err: any) {
    status = 'error';
    lastError = err?.message ?? 'Failed to start WhatsApp client';
    starting = false;
    sock = null;
    console.error('[wa] Error starting WhatsApp socket:', err);
  } finally {
    starting = false;
  }

  return getWaState();
}

export async function logoutWa() {
  console.log('[wa] Manual logout initiated by user');
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
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
  lastError = 'Logged out by user. Click "Restart client" or scan QR to reconnect.';
  // User explicitly logged out: delete disk credentials so fresh QR can generate
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
  Math.max(0, Number(process.env.WA_SEND_GAP_MS ?? 1_200))
); // fast anti-flood spacing (1.2s)
const WA_SEND_JITTER_MS = Math.min(
  60_000,
  Math.max(0, Number(process.env.WA_SEND_JITTER_MS ?? 800))
); // fast random jitter (0.8s)

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
  jid: string,
  message: string,
  attachments: WaAttachment[],
  cta?: WaCtaUrl
): Promise<{ id: string | null }> {
  const s = sock;
  if (!s) throw new Error('WhatsApp socket is gone');
  let firstId: string | null = null;

  const plainText = message.trim();

  // Pure text + CTA fits in one interactive bubble on modern clients, with a
  // plain-text safety net when the interactive send is rejected.
  if (cta) {
    let sentInteractive = false;
    try {
      if (plainText || attachments.length === 0) {
        const waMsg = buildCtaUrlMessage(
          jid,
          plainText || `Tap the button below to continue.`,
          'MyFees · Payment & updates',
          cta
        );
        const msgId = waMsg.key?.id || ('3EB0' + randomBytes(8).toString('hex').toUpperCase());
        await s.relayMessage(jid, waMsg.message, { messageId: msgId });
        firstId = msgId;
        sentInteractive = true;
      }
    } catch (err: any) {
      console.log(`[wa] cta_url relayMessage failed: ${err?.message ?? err}`);
    }

    if (!sentInteractive) {
      if (plainText) {
        const fallbackText = `${plainText}\n\n👉 ${cta.displayText}: ${cta.url}`;
        const sent = await s.sendMessage(jid, { text: fallbackText });
        firstId = firstId ?? sent?.key?.id ?? null;
      } else {
        const sent = await s.sendMessage(jid, { text: cta.url });
        firstId = firstId ?? sent?.key?.id ?? null;
      }
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

  if (plainText) {
    const sent = await s.sendMessage(jid, { text: plainText });
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

function waitForReady(maxWaitMs: number): Promise<boolean> {
  if (status === 'ready' && sock) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (status === 'ready' && sock) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start >= maxWaitMs || status === 'error' || status === 'qr') {
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
  cta?: WaCtaUrl
) {
  // If socket is starting or reconnecting, wait briefly for connection to open
  if (status === 'starting' || (!sock && status !== 'qr' && status !== 'error')) {
    await waitForReady(7_000);
  }

  if (!sock || status !== 'ready') {
    const hint =
      status === 'qr'
        ? 'WhatsApp is not connected. Scan the QR code on the Settings page first.'
        : status === 'starting'
          ? 'WhatsApp client is currently connecting. Please try again in a few moments.'
          : `WhatsApp is not connected (status: ${status}). Scan the QR code on the Settings page first.`;
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

  // Funnel through the global paced queue so concurrent callers (cron run,
  // announcements, manual sends) can never burst-line WhatsApp.
  try {
    return await enqueueSend(() => performSend(jid, message, attachments, cta));
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
