import { existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
// whatsapp-web.js is CommonJS; load via require for reliable ESM interop.
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js') as {
  Client: new (opts: any) => any;
  LocalAuth: new (opts: any) => any;
  MessageMedia: new (mime: string, data: string, filename?: string) => any;
};

export type WaStatus =
  | 'idle'
  | 'starting'
  | 'qr'
  | 'ready'
  | 'disconnected'
  | 'error';

let client: any | null = null;
let status: WaStatus = 'idle';
let qrDataUrl: string | null = null;
let connectedNumber: string | null = null;
let lastError: string | null = null;
let starting = false;

/**
 * Delete the stored WhatsApp session. Needed whenever the phone revokes the
 * browser (LOGOUT / auth failure): the saved credentials are dead and
 * initialize() would otherwise hang forever waiting on them, leaving the UI
 * spinning on "connecting" with no QR ever appearing.
 */
function purgeWaSession() {
  try {
    rmSync('.wwebjs_auth', { recursive: true, force: true });
    console.log('[wa] stale auth session purged');
  } catch (err: any) {
    console.log(`[wa] could not purge auth session: ${err?.message ?? err}`);
  }
}

function findChromeExecutable(): string | undefined {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  if (
    process.env.PUPPETEER_EXECUTABLE_PATH &&
    existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)
  ) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const candidates = [
    // Windows Chrome
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    // Windows Edge
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
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

export async function startWa() {
  if (status === 'ready' || starting) return getWaState();
  starting = true;
  status = 'starting';
  lastError = null;

  // A previous puppeteer/Chromium instance may still be alive after an error
  // or disconnect. Starting a new client while its user-data dir is locked
  // fails with "The browser is already running for <userDataDir>" — destroy
  // the old driver first so the profile lock is released.
  if (client) {
    try {
      await client.destroy();
    } catch {
      // stale driver may be half-dead; the profile lock dies with the process
    }
    client = null;
  }

  try {
    if (!client) {
      const execPath = findChromeExecutable();
      const puppeteerOptions: Record<string, any> = {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          // Slim Chromium down: on a 512 MB droplet every helper process counts.
          '--disable-crash-reporter',
          '--disable-background-networking',
          '--disable-component-update',
          '--no-first-run',
          '--disable-features=TranslateUA,OptimizationHints',
        ],
      };

      if (execPath) {
        puppeteerOptions.executablePath = execPath;
      }

      client = new Client({
        authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
        puppeteer: puppeteerOptions,
        // Skips an extra CSP pass during startup injection — measurably quicker
        // protocol init, especially under memory pressure.
        bypassCSP: true,
      });

      client.on('qr', async (qr: string) => {
        try {
          qrDataUrl = await QRCode.toDataURL(qr);
          status = 'qr';
        } catch (err: any) {
          lastError = err?.message ?? 'Failed to render QR';
        }
      });

      client.on('authenticated', () => {
        qrDataUrl = null;
      });

      // Phone revoked/failed the pairing — the stored session is dead from
      // this point on, so purge it immediately or the next initialize()
      // hangs on invalid credentials.
      client.on('auth_failure', (reason: any) => {
        lastError = typeof reason === 'string' ? reason : 'Authentication failed';
        status = 'disconnected';
        qrDataUrl = null;
        starting = false;
        const dead = client;
        client = null;
        purgeWaSession();
        void (async () => {
          await dead?.destroy();
        })().catch(() => undefined);
      });

      client.on('ready', () => {
        status = 'ready';
        qrDataUrl = null;
        lastError = null;
        try {
          connectedNumber = client?.info?.wid?.user ?? null;
        } catch {
          connectedNumber = null;
        }
      });

      client.on('disconnected', (reason: any) => {
        status = 'disconnected';
        connectedNumber = null;
        qrDataUrl = null;
        const reasonText = typeof reason === 'string' ? reason : null;
        lastError = reasonText;
        starting = false;
        // Release the browser immediately so a later start cannot hit the
        // profile lock ("browser is already running").
        const stale = client;
        client = null;
        try {
          void (async () => {
            await stale?.destroy();
          })().catch(() => undefined);
        } catch {
          // ignore
        }

        if (reasonText && /log\s?out|logged out|LOGOUT/i.test(reasonText)) {
          // The phone logged this browser out: the saved session is invalid.
          // Purge it and boot a fresh client so a new QR shows up on its own
          // instead of the UI spinning forever on "connecting".
          purgeWaSession();
          setTimeout(() => {
            void startWa();
          }, 1_500).unref?.();
        }
      });
    }

    // Hard cap on boot: initialize() can hang indefinitely on an invalid or
    // revoked session ("taking so long to connect"). On timeout, tear the
    // client down, purge the (likely dead) session and let the user retry.
    const INIT_TIMEOUT_MS = Math.max(
      30_000,
      Number(process.env.WA_INIT_TIMEOUT_MS ?? 90_000)
    );
    await Promise.race([
      client.initialize(),
      new Promise<never>((_, reject) => {
        const t = setTimeout(
          () =>
            reject(
              new Error(
                `WhatsApp boot timed out after ${INIT_TIMEOUT_MS / 1000}s (stale session cleared — connect again for a fresh QR)`
              )
            ),
          INIT_TIMEOUT_MS
        );
        // Never keep the process alive just for this timer.
        (t as { unref?: () => void }).unref?.();
      }),
    ]);
  } catch (err: any) {
    status = 'error';
    lastError = err?.message ?? 'Failed to start WhatsApp client';
    starting = false;
    const msg = String(err?.message ?? '');
    // Only purge on hang/timeout-style failures. A browser-launch failure
    // (out of memory etc.) must never destroy a valid paired session.
    if (/timed out|stale session/i.test(msg)) {
      purgeWaSession();
    }
    const dead = client;
    client = null;
    try {
      void (async () => {
        await dead?.destroy();
      })().catch(() => undefined);
    } catch {
      // ignore
    }
  } finally {
    if (status === 'starting') {
      // initialize() resolved but 'ready'/'qr' event hasn't fired yet;
      // leave status as-is, clear the guard so retries are possible.
    }
    if (status !== 'starting') starting = false;
  }

  return getWaState();
}

export async function logoutWa() {
  try {
    await client?.logout();
  } catch {
    // ignore — client may already be logged out
  }
  try {
    await client?.destroy();
  } catch {
    // ignore
  }
  client = null;
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
 * without it the session cannot resolve the contact and sends fail with
 * "No LID for user".
 */
export function normalizeWaNumber(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  return digits;
}

export interface WaAttachment {
  name: string;
  mime: string;
  /** base64 payload (no data: URL prefix) */
  data: string;
}

export async function sendWaMessage(
  to: string,
  message: string,
  attachments: WaAttachment[] = []
) {
  if (!client || status !== 'ready') {
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
  // Resolve the stored number to a real WhatsApp JID first. This surfaces an
  // actionable error ("number not on WhatsApp") instead of the cryptic
  // "No LID for user" protocol error from a blind sendMessage call.
  const chatId = `${digits}@c.us`;
  const target =
    typeof client.getNumberId === 'function'
      ? await client.getNumberId(chatId)
      : null;
  const resolvedId = target?._serialized ?? chatId;
  if (target !== null && !target?._serialized) {
    const err = new Error(
      `Phone number +${digits} could not be resolved on WhatsApp. Check that the country code is correct and the number is registered on WhatsApp.`
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  if (!message.trim() && attachments.length > 0) {
    // File-only send: the first file carries no caption.
    const media = new MessageMedia(
      attachments[0].mime,
      attachments[0].data,
      attachments[0].name
    );
    const sent: any = await client.sendMessage(resolvedId, media);
    const ids: (string | null)[] = [sent?.id?._serialized ?? sent?.id ?? null];
    for (const att of attachments.slice(1)) {
      const next = new MessageMedia(att.mime, att.data, att.name);
      const more: any = await client.sendMessage(resolvedId, next);
      ids.push(more?.id?._serialized ?? more?.id ?? null);
    }
    return { id: ids[0] ?? null, to: digits };
  }
  const sent: any = await client.sendMessage(resolvedId, message);
  const firstId = sent?.id?._serialized ?? sent?.id ?? null;
  // Text is delivered first; attachments follow as their own messages so a
  // single unsupported file cannot swallow the whole announcement.
  for (const att of attachments) {
    const media = new MessageMedia(att.mime, att.data, att.name);
    await client.sendMessage(resolvedId, media);
  }
  return { id: firstId, to: digits };
}
