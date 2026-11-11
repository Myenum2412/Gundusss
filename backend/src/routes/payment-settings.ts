import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import {
  DB_TABLES,
  getRecord,
  putRecord,
} from '../db.js';
import { resolveProfileId } from '../profiles.js';
import { scopedEntityId } from '../tenant.js';

/**
 * Per-workspace merchant UPI profile for the in-app checkout preview.
 *
 * Everything here is scoped to the active profile (`profileId:1`). The fees app
 * never reads or writes a shared gateway account, so one workspace can never
 * overwrite another workspace's UPI ID or QR code.
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

const COLLECTION = DB_TABLES.paymentSettings;

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

export interface CheckoutUpiState {
  ready: boolean;
  upiId: string;
  payeeName: string;
  source: 'settings' | 'none';
  error?: string;
}

/**
 * Resolves the VPA a public checkout will actually use. Only this workspace's
 * saved UPI is considered — there is deliberately no shared-gateway fallback.
 */
export async function getEffectiveCheckoutUpi(
  profileId: string
): Promise<CheckoutUpiState> {
  const local = await readLocalSettings(profileId);
  const localUpi = local?.upi_id?.trim() ?? '';
  const localPayee = local?.payee_name?.trim() || DEFAULT_PAYEE_NAME;

  if (isUsableUpiId(localUpi)) {
    return {
      ready: true,
      upiId: localUpi,
      payeeName: localPayee,
      source: 'settings',
    };
  }

  return {
    ready: false,
    upiId: '',
    payeeName: localPayee,
    source: 'none',
    error:
      'No UPI ID is saved for this workspace. Add your own UPI under Settings → UPI payment setup.',
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

async function presentSettings(local: SettingsRow | null) {
  const upiId = local?.upi_id?.trim() ?? '';
  const payeeName = local?.payee_name?.trim() || DEFAULT_PAYEE_NAME;
  const savedQr = local?.qr_code_data_url ?? '';
  const generatedQrDataUrl = savedQr ? '' : await generateQrDataUrl(upiId, payeeName);

  return {
    upiId,
    payeeName,
    qrCodeDataUrl: savedQr,
    generatedQrDataUrl,
    updatedAt: local?.updated_at ?? null,
  };
}

export async function paymentSettingsRoutes(app: FastifyInstance) {
  // GET /api/payments/settings — this workspace's saved merchant profile.
  app.get('/api/payments/settings', async (req) => {
    const profileId = await resolveProfileId(req);
    const local = await readLocalSettings(profileId);
    return { data: await presentSettings(local) };
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

  // POST /api/payments/settings/sync — kept for older clients; settings are
  // already local to this workspace, so this simply returns them unchanged.
  app.post('/api/payments/settings/sync', async (req) => {
    const profileId = await resolveProfileId(req);
    const local = await readLocalSettings(profileId);
    return { data: await presentSettings(local) };
  });

  // PUT /api/payments/settings — save this workspace's UPI ID / payee / QR.
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

    const saved = await readLocalSettings(profileId);
    return { data: await presentSettings(saved) };
  });
}
