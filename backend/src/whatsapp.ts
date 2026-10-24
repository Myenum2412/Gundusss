import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
// whatsapp-web.js is CommonJS; load via require for reliable ESM interop.
const { Client, LocalAuth } = require('whatsapp-web.js') as {
  Client: new (opts: any) => any;
  LocalAuth: new (opts: any) => any;
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

  try {
    if (!client) {
      const execPath = findChromeExecutable();
      const puppeteerOptions: Record<string, any> = {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      };

      if (execPath) {
        puppeteerOptions.executablePath = execPath;
      }

      client = new Client({
        authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
        puppeteer: puppeteerOptions,
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
        lastError = typeof reason === 'string' ? reason : null;
        starting = false;
      });
    }

    await client.initialize();
  } catch (err: any) {
    status = 'error';
    lastError = err?.message ?? 'Failed to start WhatsApp client';
    starting = false;
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
  return getWaState();
}

export async function sendWaMessage(to: string, message: string) {
  if (!client || status !== 'ready') {
    const err = new Error(
      'WhatsApp is not connected. Scan the QR code on the Settings page first.'
    ) as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }
  const digits = to.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    const err = new Error(
      'Invalid phone number. Use international format with country code, e.g. 919876543210.'
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  const chatId = `${digits}@c.us`;
  const sent: any = await client.sendMessage(chatId, message);
  return { id: sent?.id?._serialized ?? sent?.id ?? null, to: digits };
}
