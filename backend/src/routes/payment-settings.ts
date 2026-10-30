import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import {
  APPWRITE_COLLECTIONS,
  getRecord,
  putRecord,
} from '../db.js';
import { resolveProfileId } from '../profiles.js';
import { scopedEntityId } from '../tenant.js';

/**
 * Merchant UPI profile for the in-app checkout preview.
 *
 * The uploaded QR is stored in this app. YOUPI PG still issues a fresh,
 * amount-specific QR at checkout so its banking observers can verify the
 * transfer; the UPI ID is synced to the gateway's active receiving account.
 */

const DEFAULT_PAYEE_NAME = 'Fees';
const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;
/**
 * Seed values used by the gateway's local database and older demos. They pass
 * the VPA regex but cannot receive money, so they must never reach a payer.
 */
const PLACEHOLDER_VPAS = new Set([
  'merchant@upi',
  'demo@upi',
  'test@upi',
  'sample@upi',
  'example@upi',
  'yourupi@bank',
  'upi@upi',
]);
const MAX_QR_BYTES = 2 * 1024 * 1024;
const MAX_QR_DATA_URL_CHARS = 3_500_000;
// QR encoding is deterministic and comparatively expensive; the preview calls
// this on every edit, so keep a small bounded cache.
const qrCache = new Map<string, string>();

interface SettingsRow {
  upi_id: string;
  payee_name: string;
  qr_code_data_url: string;
  updated_at: string | null;
}

interface SettingsBody {
  upiId?: string;
  payeeName?: string;
  qrCodeDataUrl?: string;
}

interface GatewayInfo {
  connected: boolean;
  synced?: boolean;
  pendingSync?: boolean;
  upiId?: string;
  payeeName?: string;
  error?: string;
}

interface GatewayAccountResponse {
  upiId?: string;
  payeeName?: string;
  receivingAccount?: { upiId?: string; payeeName?: string };
  account?: { upiId?: string; payeeName?: string };
  error?: string;
  message?: string;
}

function gatewayBaseUrl() {
  return (process.env.YOUPI_PAYMENT_API_URL ?? 'http://localhost:6100').replace(/\/+$/, '');
}

function adminToken() {
  return (process.env.YOUPI_ADMIN_TOKEN ?? '').trim();
}

const COLLECTION = APPWRITE_COLLECTIONS.paymentSettings;

async function readLocalSettings(
  profileId: string
): Promise<SettingsRow | null> {
  const record = await getRecord<SettingsRow>(
    COLLECTION,
    scopedEntityId(profileId, '1')
  );
  return record?.data ?? null;
}

/** True for a syntactically valid, non-placeholder merchant VPA. */
export function isUsableUpiId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const clean = value.trim();
  return VPA_RE.test(clean) && !PLACEHOLDER_VPAS.has(clean.toLowerCase());
}

async function fetchGatewayWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * baseDelayMs));
      }
    }
  }
  throw lastErr;
}

export async function fetchGatewaySettings(
  timeoutMs = 6000
): Promise<GatewayInfo> {
  const token = adminToken();
  if (!token) {
    return {
      connected: false,
      error: 'YOUPI_ADMIN_TOKEN is not configured for the fees backend.',
    };
  }

  try {
    const res = await fetchGatewayWithRetry(`${gatewayBaseUrl()}/api/v1/admin/upi-settings`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => null)) as GatewayAccountResponse | null;
    if (!res.ok) {
      return {
        connected: true,
        error: json?.error ?? json?.message ?? `Gateway returned HTTP ${res.status}.`,
      };
    }
    return {
      connected: true,
      upiId: json?.upiId ?? '',
      payeeName: json?.payeeName ?? '',
    };
  } catch {
    return {
      connected: false,
      pendingSync: true,
      error: 'YOUPI PG is not reachable. Start the gateway to sync the checkout UPI ID.',
    };
  }
}

async function syncGatewaySettings(upiId: string, payeeName: string): Promise<GatewayInfo> {
  const token = adminToken();
  if (!token) {
    return {
      connected: false,
      synced: false,
      error: 'YOUPI_ADMIN_TOKEN is not configured for the fees backend.',
    };
  }

  try {
    const res = await fetch(`${gatewayBaseUrl()}/api/v1/admin/upi-settings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ upiId, payeeName }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as GatewayAccountResponse | null;
    if (!res.ok) {
      return {
        connected: true,
        synced: false,
        error: json?.error ?? json?.message ?? `Gateway returned HTTP ${res.status}.`,
      };
    }
    const account = json?.receivingAccount ?? json?.account;
    return {
      connected: true,
      synced: true,
      upiId: account?.upiId ?? json?.upiId ?? upiId,
      payeeName: account?.payeeName ?? json?.payeeName ?? payeeName,
    };
  } catch {
    return {
      connected: false,
      synced: false,
      pendingSync: true,
      error: 'YOUPI PG is offline right now. The UPI ID is saved and will sync before the next checkout.',
    };
  }
}

/**
 * Make sure a saved UPI ID reaches the gateway before a new checkout starts.
 * This closes the gap where a save happened while YOUPI PG was offline.
 */
export async function ensureGatewayUpiSynced(
  profileId: string
): Promise<GatewayInfo | null> {
  const local = await readLocalSettings(profileId);
  const upiId = local?.upi_id?.trim() ?? '';
  if (!isUsableUpiId(upiId)) return null;

  const payeeName = local?.payee_name?.trim() || DEFAULT_PAYEE_NAME;
  const current = await fetchGatewaySettings();
  if (!current.connected) return current;

  if (current.upiId === upiId && (current.payeeName ?? '') === payeeName) {
    return { ...current, synced: true };
  }
  return syncGatewaySettings(upiId, payeeName);
}

export interface CheckoutUpiState {
  ready: boolean;
  upiId: string;
  payeeName: string;
  source: 'settings' | 'gateway' | 'none';
  error?: string;
}

/**
 * Resolves the VPA that a public checkout will actually use.
 *
 * Preference order: the workspace's saved UPI ID (synced to the gateway), then
 * the gateway's active receiving account. A placeholder or missing VPA is
 * reported as not ready instead of silently creating an unpayable order.
 */
export async function getEffectiveCheckoutUpi(
  profileId: string
): Promise<CheckoutUpiState> {
  const local = await readLocalSettings(profileId);
  const localUpi = local?.upi_id?.trim() ?? '';
  const localPayee = local?.payee_name?.trim() || DEFAULT_PAYEE_NAME;

  if (isUsableUpiId(localUpi)) {
    const gateway = await ensureGatewayUpiSynced(profileId);
    // A reachable gateway that refused the sync would charge the wrong VPA.
    if (gateway?.connected && gateway.synced === false && gateway.error) {
      return {
        ready: false,
        upiId: localUpi,
        payeeName: localPayee,
        source: 'settings',
        error: gateway.error,
      };
    }
    return {
      ready: true,
      upiId: localUpi,
      payeeName: localPayee,
      source: 'settings',
    };
  }

  const gateway = await fetchGatewaySettings();
  if (!gateway.connected) {
    return {
      ready: false,
      upiId: '',
      payeeName: localPayee,
      source: 'none',
      error: gateway.error || 'YOUPI PG is unreachable.',
    };
  }
  if (!isUsableUpiId(gateway.upiId)) {
    return {
      ready: false,
      upiId: '',
      payeeName: gateway.payeeName || localPayee,
      source: 'none',
      error:
        gateway.error ||
        'No merchant UPI ID is configured in YOUPI PG. Save one under Payments → UPI setup.',
    };
  }
  return {
    ready: true,
    upiId: gateway.upiId,
    payeeName: gateway.payeeName || localPayee,
    source: 'gateway',
  };
}

function validateQrDataUrl(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: 'QR image must be a data URL string.' };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: '' };
  if (trimmed.length > MAX_QR_DATA_URL_CHARS) {
    return { ok: false, error: 'QR image is too large (maximum 2 MB).' };
  }

  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(trimmed);
  if (!match) {
    return { ok: false, error: 'QR image must be a PNG, JPG or WebP data URL.' };
  }

  const mime = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0) {
    return { ok: false, error: 'QR image is empty.' };
  }
  if (bytes.length > MAX_QR_BYTES) {
    return { ok: false, error: 'QR image is too large (maximum 2 MB).' };
  }

  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';

  if (!isPng && !isJpeg && !isWebp) {
    return { ok: false, error: 'That file is not a valid PNG, JPG or WebP image.' };
  }

  return { ok: true, value: `data:image/${mime};base64,${bytes.toString('base64')}` };
}

function normalizePreviewAmount(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return amount.toFixed(2);
}

async function generateQrDataUrl(
  upiId: string,
  payeeName: string,
  amount = ''
): Promise<string> {
  if (!VPA_RE.test(upiId)) return '';
  const payee = payeeName || DEFAULT_PAYEE_NAME;
  const cacheKey = `${upiId}\u0000${payee}\u0000${amount}`;
  const cached = qrCache.get(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({ pa: upiId, pn: payee, cu: 'INR' });
    if (amount) params.set('am', amount);
    const dataUrl = await QRCode.toDataURL(`upi://pay?${params.toString()}`, {
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#FFFFFF' },
    });
    if (dataUrl) {
      qrCache.set(cacheKey, dataUrl);
      if (qrCache.size > 200) {
        const oldest = qrCache.keys().next().value;
        if (oldest) qrCache.delete(oldest);
      }
    }
    return dataUrl;
  } catch {
    return '';
  }
}

async function presentSettings(local: SettingsRow | null, gateway: GatewayInfo) {
  const localUpi = local?.upi_id?.trim() ?? '';
  const localPayee = local?.payee_name?.trim() ?? '';
  const upiId = localUpi || gateway.upiId || '';
  const payeeName = localPayee || gateway.payeeName || DEFAULT_PAYEE_NAME;
  const savedQr = local?.qr_code_data_url ?? '';
  const generatedQrDataUrl = savedQr ? '' : await generateQrDataUrl(upiId, payeeName);

  const gatewaySynced =
    Boolean(localUpi) &&
    gateway.connected &&
    gateway.upiId === localUpi &&
    (gateway.payeeName ?? '') === localPayee;

  return {
    upiId,
    payeeName,
    qrCodeDataUrl: savedQr,
    generatedQrDataUrl,
    updatedAt: local?.updated_at ?? null,
    gateway: {
      ...gateway,
      synced: gatewaySynced,
    },
  };
}

export async function paymentSettingsRoutes(app: FastifyInstance) {
  // GET /api/payments/settings — local merchant profile plus gateway sync state.
  app.get('/api/payments/settings', async (req) => {
    const profileId = await resolveProfileId(req);
    const local = await readLocalSettings(profileId);
    const gateway = await fetchGatewaySettings();
    return { data: await presentSettings(local, gateway) };
  });

  // GET /api/payments/settings/qr — live QR preview for unsaved form values.
  app.get('/api/payments/settings/qr', async (req) => {
    const q = (req.query ?? {}) as {
      upiId?: string;
      payeeName?: string;
      amount?: string;
    };
    const upiId = (q.upiId ?? '').trim();
    const payeeName = (q.payeeName ?? '').trim().slice(0, 120) || DEFAULT_PAYEE_NAME;
    const amount = normalizePreviewAmount(q.amount);
    if (!VPA_RE.test(upiId)) return { data: { qrDataUrl: '' } };
    return {
      data: { qrDataUrl: await generateQrDataUrl(upiId, payeeName, amount) },
    };
  });

  // POST /api/payments/settings/sync — retry a pending gateway sync.
  app.post('/api/payments/settings/sync', async (req) => {
    const profileId = await resolveProfileId(req);
    const local = await readLocalSettings(profileId);
    const upiId = local?.upi_id?.trim() ?? '';
    const gateway = upiId
      ? await syncGatewaySettings(upiId, local?.payee_name?.trim() || DEFAULT_PAYEE_NAME)
      : await fetchGatewaySettings();
    return { data: await presentSettings(local, gateway) };
  });

  // PUT /api/payments/settings — save UPI ID / payee / QR and sync the VPA.
  app.put('/api/payments/settings', async (req, reply) => {
    const body = (req.body ?? {}) as SettingsBody;
    const upiId = (body.upiId ?? '').trim();
    const payeeName = (body.payeeName ?? '').trim().slice(0, 120) || DEFAULT_PAYEE_NAME;

    if (!upiId) {
      return reply.code(400).send({ error: 'UPI ID is required.' });
    }
    if (!VPA_RE.test(upiId)) {
      return reply.code(400).send({
        error: 'Enter a valid UPI ID in the format name@bank (for example, school@okhdfcbank).',
      });
    }

    const profileId = await resolveProfileId(req);
    const existing = await readLocalSettings(profileId);
    const qr = validateQrDataUrl(
      body.qrCodeDataUrl === undefined ? existing?.qr_code_data_url ?? '' : body.qrCodeDataUrl
    );
    if (!qr.ok) {
      return reply.code(400).send({ error: qr.error });
    }

    await putRecord<SettingsRow>(
      COLLECTION,
      scopedEntityId(profileId, '1'),
      {
        upi_id: upiId,
        payee_name: payeeName,
        qr_code_data_url: qr.value,
        updated_at: new Date().toISOString(),
      }
    );

    const gateway = await syncGatewaySettings(upiId, payeeName);
    if (!gateway.synced) {
      app.log.warn(
        { gatewayError: gateway.error, profileId },
        'UPI settings saved locally but could not be synced to YOUPI PG'
      );
    }

    const saved = await readLocalSettings(profileId);
    return { data: await presentSettings(saved, gateway) };
  });
}
