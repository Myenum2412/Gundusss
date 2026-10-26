import type { FastifyInstance, FastifyReply } from 'fastify';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  APPWRITE_COLLECTIONS,
  getRecord,
  listRecords,
  listScopedRecords,
  putRecord,
} from '../appwrite.js';
import {
  findProfileBySlug,
  getProfile,
  resolveProfileId,
} from '../profiles.js';
import type { Fee } from '../schemas.js';
import {
  SUPER_PROFILE_ID,
  isValidProfileId,
  scopedEntityId,
} from '../tenant.js';
import {
  fetchGatewaySettings,
  getEffectiveCheckoutUpi,
  isUsableUpiId,
} from './payment-settings.js';
import { getWaState, sendWaMessage, type WaAttachment } from '../whatsapp.js';
import { generateReceiptPdf } from '../receipt-pdf.js';

const YOUPI_API = (process.env.YOUPI_PAYMENT_API_URL ?? 'http://localhost:6100').replace(/\/+$/, '');
const YOUPI_WEBHOOK_SECRET = process.env.YOUPI_WEBHOOK_SECRET ?? '';
const YOUPI_ADMIN_TOKEN = (process.env.YOUPI_ADMIN_TOKEN ?? '').trim();

/**
 * Public origin of the YOUPI checkout portal. The gateway knows this too, but
 * a reverse proxy or split deployment can make its response point at
 * localhost, so an explicit override wins when configured.
 */
function publicCheckoutBaseUrl(): string {
  return (
    process.env.YOUPI_PUBLIC_CHECKOUT_URL ||
    process.env.YOUPI_CHECKOUT_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
}

/** Prefer the configured public portal over a gateway-supplied URL. */
function resolveCheckoutUrl(
  gatewayUrl: string | undefined,
  paymentId: string | null | undefined
): string {
  const base = publicCheckoutBaseUrl();
  if (base && paymentId) {
    return `${base}/checkout/${encodeURIComponent(paymentId)}`;
  }
  return (gatewayUrl ?? '').trim();
}

const ORDERS = APPWRITE_COLLECTIONS.paymentOrders;
const EVENTS = APPWRITE_COLLECTIONS.paymentEvents;
const FEES = APPWRITE_COLLECTIONS.fees;
const RECEIPTS = APPWRITE_COLLECTIONS.receipts;

const PAYMENT_METHODS = ['UPI', 'CASH_COUNTER', 'CARD_COUNTER'] as const;
type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];
const COUNTER_METHODS = new Set<string>(['CASH_COUNTER', 'CARD_COUNTER']);

function normalizePaymentMethod(value?: string): PaymentMethodValue | null {
  const raw = (value ?? '').trim().toUpperCase();
  if (!raw) return 'UPI';
  const method = raw === 'CASH' ? 'CASH_COUNTER' : raw === 'CARD' ? 'CARD_COUNTER' : raw;
  return (PAYMENT_METHODS as readonly string[]).includes(method)
    ? (method as PaymentMethodValue)
    : null;
}

const TERMINAL_STATUSES = new Set([
  'SUCCESS',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'CANCELED',
  'SUSPICIOUS',
  'BLOCKED',
  'REFUNDED',
]);

const KNOWN_STATUSES = new Set([
  'INITIATED',
  'QUEUED',
  'ACTIVE',
  'PROCESSING',
  ...TERMINAL_STATUSES,
]);

interface LocalOrder {
  profileId: string;
  orderId: string;
  paymentId: string | null;
  status: string;
  gatewayStatus: string;
  method: string;
  utr: string;
  amount: string;
  studentId: string;
  studentName: string;
  feeId: number | null;
  checkoutUrl: string;
  paymentUrl?: string;
  receiptId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GatewayPaymentView {
  status?: string;
  internalStatus?: string;
  method?: string;
}

interface PaymentEventRow {
  profileId?: string;
  id: string;
  orderId: string;
  status: string;
  gatewayStatus: string;
  method: string;
  source: string;
  message: string;
  createdAt: string;
}

interface ReceiptRecord {
  profileId?: string;
  receiptId: string;
  studentId: string;
  studentName: string;
  amount: string;
  method: string;
  paymentDate: string;
  status: string;
  notes: string;
}

interface CreatePaymentBody {
  orderId?: string;
  studentId?: string;
  studentName?: string;
  amount?: number | string;
  email?: string;
  phone?: string;
  description?: string;
  feeId?: number;
  method?: string;
}

interface UpstreamPayment {
  paymentId?: string;
  orderId?: string;
  amount?: string;
  amountPaise?: string | number;
  currency?: string;
  status?: string;
  queuePosition?: number;
  checkoutUrl?: string;
  error?: string;
  message?: string;
  code?: string;
}

interface WebhookPayload {
  event?: string;
  paymentId?: string;
  orderId?: string;
  amount?: string;
  amountPaise?: number;
  currency?: string;
  method?: string;
  utr?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function fetchGatewayPayment(
  paymentId: string | null,
  orderId: string
): Promise<GatewayPaymentView | null> {
  const id = paymentId || orderId;
  if (!id) return null;

  const headers: Record<string, string> = {};
  if (YOUPI_WEBHOOK_SECRET) headers['X-Merchant-Key'] = YOUPI_WEBHOOK_SECRET;

  try {
    const upstream = await fetch(`${YOUPI_API}/api/v1/payments/${encodeURIComponent(id)}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) return null;
    return (await upstream.json().catch(() => null)) as GatewayPaymentView | null;
  } catch {
    return null;
  }
}

/** Ensure an order loaded from storage always carries its workspace id. */
function normalizeStoredOrder(
  order: LocalOrder,
  profileId: string
): LocalOrder {
  const configuredCheckoutBase = publicCheckoutBaseUrl();
  const paymentUrl =
    configuredCheckoutBase && order.paymentId
      ? resolveCheckoutUrl(undefined, order.paymentId)
      : order.paymentUrl ||
        order.checkoutUrl ||
        resolveCheckoutUrl(undefined, order.paymentId);
  return {
    ...order,
    profileId: (order.profileId ?? '').trim() || profileId,
    checkoutUrl: order.checkoutUrl || paymentUrl,
    paymentUrl,
  };
}

async function getLocalOrder(
  profileId: string,
  orderId: string
): Promise<LocalOrder | null> {
  const record = await getRecord<LocalOrder>(
    ORDERS,
    scopedEntityId(profileId, orderId)
  );
  return record ? normalizeStoredOrder(record.data, profileId) : null;
}

async function listOrders(profileId: string): Promise<LocalOrder[]> {
  const records = await listScopedRecords<LocalOrder>(ORDERS, profileId);
  return records
    .map((record) => normalizeStoredOrder(record.data, profileId))
    .sort((a, b) =>
      String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
    );
}

async function findLocalOrder(
  profileId: string,
  id: string
): Promise<LocalOrder | null> {
  const direct = await getLocalOrder(profileId, id);
  if (direct) return direct;
  const orders = await listOrders(profileId);
  return orders.find((order) => order.paymentId === id) ?? null;
}

/**
 * Webhook-only lookup: the gateway callback carries no user session, so the
 * order (and therefore its profile) must be discovered from the order id.
 */
async function findOrderAcrossProfiles(
  orderId: string
): Promise<LocalOrder | null> {
  const records = await listRecords<LocalOrder>(ORDERS);
  for (const record of records) {
    const order = record.data;
    if (order.orderId !== orderId) continue;
    const rowProfile =
      (order.profileId ?? '').trim() ||
      record.entityId.split(':')[0] ||
      SUPER_PROFILE_ID;
    return normalizeStoredOrder(order, rowProfile);
  }
  return null;
}

async function saveLocalOrder(order: LocalOrder): Promise<void> {
  if (!order.profileId) {
    throw new Error('Cannot save a payment order without a profile id.');
  }
  await putRecord(
    ORDERS,
    scopedEntityId(order.profileId, order.orderId),
    order
  );
}

async function readPaymentEvents(
  profileId: string,
  orderId: string
): Promise<PaymentEventRow[]> {
  const records = await listScopedRecords<PaymentEventRow>(EVENTS, profileId);
  return records
    .map((record) => record.data)
    .filter((event) => event.orderId === orderId)
    .sort(
      (a, b) =>
        String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) ||
        String(a.id).localeCompare(String(b.id))
    );
}

/**
 * Append-only lifecycle log. Polling and webhook retries are noisy, so an
 * event is only written when the last known tuple actually changes.
 */
async function recordPaymentEvent(
  profileId: string,
  input: {
    orderId: string;
    status: string;
    gatewayStatus?: string;
    method?: string;
    source: string;
    message?: string;
  }
): Promise<void> {
  const gatewayStatus = input.gatewayStatus ?? '';
  const events = await readPaymentEvents(profileId, input.orderId);
  const previous = events[events.length - 1];
  if (
    previous &&
    previous.status === input.status &&
    previous.gatewayStatus === gatewayStatus &&
    previous.source === input.source
  ) {
    return;
  }

  const event: PaymentEventRow = {
    profileId,
    id: randomUUID(),
    orderId: input.orderId,
    status: input.status,
    gatewayStatus,
    method: input.method ?? '',
    source: input.source,
    message: input.message ?? '',
    createdAt: nowIso(),
  };
  await putRecord(
    EVENTS,
    scopedEntityId(profileId, event.id),
    event
  );
}

async function listReceipts(
  profileId: string
): Promise<Array<{ entityId: string; data: ReceiptRecord }>> {
  const records = await listScopedRecords<ReceiptRecord>(RECEIPTS, profileId);
  return records.map((record) => ({ entityId: record.entityId, data: record.data }));
}

async function nextReceiptId(profileId: string): Promise<string> {
  const receipts = await listReceipts(profileId);
  const max = receipts.reduce((current, receipt) => {
    const digits = String(receipt.data.receiptId ?? receipt.entityId).replace(/[^0-9]/g, '');
    return Math.max(current, Number(digits) || 0);
  }, 0);
  return `RCP-${String(max + 1).padStart(3, '0')}`;
}

// Appwrite has no transactions. Serializing receipt creation in-process keeps
// duplicate webhook deliveries from allocating two receipt numbers, and the
// notes lookup below recovers if a crash happened after the receipt write.
let receiptQueue: Promise<unknown> = Promise.resolve();

function withReceiptLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = receiptQueue.then(fn, fn);
  receiptQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function parseFeeId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

function receiptMethod(method: string): string {
  const m = method.toUpperCase();
  if (m === 'CASH_COUNTER' || m === 'CASH') return 'Cash';
  if (m === 'CARD_COUNTER' || m === 'CARD') return 'Card';
  if (m === 'UPI') return 'UPI';
  return method || 'UPI';
}

function paymentDate(completedAt?: string): string {
  if (completedAt) {
    const parsed = new Date(completedAt);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

async function findFeeByStudentAndAmount(
  profileId: string,
  studentName: string,
  amount: number
): Promise<Fee | null> {
  const records = await listScopedRecords<Fee>(FEES, profileId);
  const matches = records
    .map((record) => record.data)
    .filter(
      (fee) =>
        fee.status !== 'paid' &&
        fee.student_name.toLowerCase() === studentName.toLowerCase() &&
        Number(fee.amount) === amount
    )
    .sort((a, b) => Number(b.id) - Number(a.id));
  return matches[0] ?? null;
}

export class GatewayCheckoutError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;

  constructor(
    message: string,
    statusCode = 502,
    code?: string,
    details?: unknown
  ) {
    super(message);
    this.name = 'GatewayCheckoutError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface CreateGatewayCheckoutInput {
  profileId: string;
  studentId?: string;
  studentName: string;
  amount: number | string;
  feeId?: number | null;
  email?: string;
  phone?: string;
  description?: string;
  method?: string;
  orderId?: string;
  source: string;
  eventMessage?: string;
}

export interface GatewayCheckoutResult {
  order: LocalOrder;
  paymentUrl: string;
  initialStatus: string;
}

/**
 * Create (or idempotently reuse) a real YOUPI PG checkout for a fee and persist
 * the local order. Both the dashboard and the public portal go through this so
 * every link handed to a student is an actual payable gateway session — never a
 * hand-built workspace URL.
 */
export async function createGatewayCheckout(
  input: CreateGatewayCheckoutInput
): Promise<GatewayCheckoutResult> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new GatewayCheckoutError('A valid positive amount is required', 400);
  }

  const studentName = (input.studentName ?? '').trim();
  if (!studentName) {
    throw new GatewayCheckoutError('studentName is required', 400);
  }

  const method = normalizePaymentMethod(input.method);
  if (!method) {
    throw new GatewayCheckoutError(
      'Invalid payment method. Use UPI, CASH_COUNTER, or CARD_COUNTER.',
      400,
      'PAYMENT_METHOD_NOT_ALLOWED'
    );
  }

  // A save made while YOUPI PG was offline is retried here, so the new checkout
  // uses the UPI ID shown in this workspace. A missing or placeholder VPA must
  // fail before an unpayable session is created.
  if (method === 'UPI') {
    const upi = await getEffectiveCheckoutUpi(input.profileId);
    if (!upi.ready) {
      throw new GatewayCheckoutError(
        upi.error ??
          'No merchant UPI ID is configured. Save one under Payments → UPI setup.',
        409,
        'UPI_NOT_CONFIGURED'
      );
    }
  }

  const orderId =
    input.orderId?.trim() || `FEE-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const amountStr = amount.toFixed(2);

  let merchantName = 'Institute Office';
  try {
    const profile = await getProfile(input.profileId);
    if (profile?.name?.trim()) {
      merchantName = profile.name.trim();
    }
  } catch {}

  const payload = {
    orderId,
    amount: amountStr,
    currency: 'INR',
    method,
    merchantName,
    customer: {
      name: studentName,
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phoneNumber: input.phone } : {}),
    },
    description: input.description ?? `Fee payment for ${studentName}`,
    metadata: {
      profileId: input.profileId,
      merchantName,
      studentId: input.studentId ?? '',
      studentName,
      feeId: input.feeId ?? null,
      source: input.source,
    },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Idempotency-Key': orderId,
  };
  // An empty X-Merchant-Key is treated as an invalid key by the gateway.
  if (YOUPI_WEBHOOK_SECRET) {
    headers['X-Merchant-Key'] = YOUPI_WEBHOOK_SECRET;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${YOUPI_API}/api/v1/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new GatewayCheckoutError(
      `Payment gateway unreachable. Is YOUPI PG running at ${YOUPI_API}?`,
      502,
      'GATEWAY_UNREACHABLE',
      err instanceof Error ? err.message : err
    );
  }

  const json = (await upstream.json().catch(() => null)) as UpstreamPayment | null;
  if (!upstream.ok || !json) {
    throw new GatewayCheckoutError(
      json?.error ??
        json?.message ??
        `Failed to create payment session (HTTP ${upstream.status})`,
      upstream.ok ? 502 : upstream.status,
      json?.code,
      json
    );
  }

  const initialStatus = json.status ?? 'INITIATED';
  const existing = await getLocalOrder(input.profileId, orderId);
  const timestamp = nowIso();
  // Reusing an order id must not regress a settled/terminal local record if
  // the gateway returns the original session for the same idempotency key.
  const alreadyTerminal = existing ? TERMINAL_STATUSES.has(existing.status) : false;
  const paymentUrl =
    resolveCheckoutUrl(json.checkoutUrl, json.paymentId) ||
    existing?.paymentUrl ||
    existing?.checkoutUrl ||
    '';

  if (method === 'UPI' && !paymentUrl) {
    throw new GatewayCheckoutError(
      'The payment gateway did not return a checkout URL. Set YOUPI_PUBLIC_CHECKOUT_URL to the public checkout portal.',
      502,
      'CHECKOUT_URL_MISSING',
      json
    );
  }

  const order: LocalOrder = existing
    ? {
        ...existing,
        profileId: input.profileId,
        paymentId: json.paymentId ?? existing.paymentId,
        status: alreadyTerminal ? existing.status : initialStatus,
        gatewayStatus: alreadyTerminal ? existing.gatewayStatus : initialStatus,
        method,
        checkoutUrl: paymentUrl || existing.checkoutUrl,
        paymentUrl: paymentUrl || existing.paymentUrl,
        updatedAt: timestamp,
      }
    : {
        profileId: input.profileId,
        orderId,
        paymentId: json.paymentId ?? null,
        status: initialStatus,
        gatewayStatus: initialStatus,
        method,
        utr: '',
        amount: amountStr,
        studentId: input.studentId ?? '',
        studentName,
        feeId: input.feeId ?? null,
        checkoutUrl: paymentUrl,
        paymentUrl,
        receiptId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
  await saveLocalOrder(order);

  await recordPaymentEvent(input.profileId, {
    orderId,
    status: initialStatus,
    gatewayStatus: initialStatus,
    method,
    source: input.source,
    message:
      input.eventMessage ??
      `${method.replace('_', ' ')} payment session created.`,
  });

  return {
    order,
    paymentUrl: order.paymentUrl || order.checkoutUrl,
    initialStatus,
  };
}

function checkoutErrorReply(
  reply: FastifyReply,
  err: unknown
): FastifyReply {
  if (err instanceof GatewayCheckoutError) {
    return reply.code(err.statusCode).send({
      error: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.details ? { details: err.details } : {}),
    });
  }
  throw err;
}

export async function paymentRoutes(app: FastifyInstance) {
  // POST /api/payments/create — open a YOUPI PG checkout session for a fee.
  app.post('/api/payments/create', async (req, reply) => {
    const body = (req.body ?? {}) as CreatePaymentBody;
    const profileId = await resolveProfileId(req);

    try {
      const { order, paymentUrl, initialStatus } = await createGatewayCheckout({
        profileId,
        orderId: body.orderId,
        studentId: body.studentId,
        studentName: body.studentName ?? '',
        amount: body.amount ?? 0,
        feeId: body.feeId ?? null,
        email: body.email,
        phone: body.phone,
        description: body.description,
        method: body.method,
        source: 'fees-monorepo',
      });

      return reply.send({
        data: {
          orderId: order.orderId,
          paymentId: order.paymentId,
          status: initialStatus,
          gatewayStatus: initialStatus,
          method: order.method,
          checkoutUrl: order.checkoutUrl,
          paymentUrl,
          amount: order.amount,
          currency: 'INR',
        },
      });
    } catch (err) {
      if (err instanceof GatewayCheckoutError) {
        app.log.warn(
          { err: err.message, code: err.code, profileId },
          'Could not create a YOUPI PG checkout'
        );
      }
      return checkoutErrorReply(reply, err);
    }
  });

  // GET /api/payments — list payment sessions created in this workspace.
  app.get('/api/payments', async (req) => {
    const profileId = await resolveProfileId(req);
    return { data: await listOrders(profileId) };
  });

  // GET /api/payments/:id — local record first, then reconcile display status
  // with the gateway. The webhook remains the only path that settles money.
  app.get('/api/payments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const profileId = await resolveProfileId(req);
    let order = await findLocalOrder(profileId, id);

    if (!order) {
      // Never fall back to the gateway for an id this workspace does not own:
      // that would expose another profile's payment details.
      return reply.code(404).send({ error: 'Payment not found' });
    }

    if (!TERMINAL_STATUSES.has(order.status)) {
      const gateway = await fetchGatewayPayment(order.paymentId, order.orderId);
      const gatewayStatus = (gateway?.internalStatus ?? gateway?.status ?? '').toUpperCase();

      if (gatewayStatus && KNOWN_STATUSES.has(gatewayStatus)) {
        // A gateway SUCCESS without a receipt stays PROCESSING until the signed
        // webhook lands and creates the receipt. This also stops a slow poll
        // from regressing a webhook-settled SUCCESS.
        const method = (gateway?.method ?? order.method ?? '').toUpperCase();
        const displayStatus =
          gatewayStatus === 'SUCCESS' && !order.receiptId
            ? 'PROCESSING'
            : gatewayStatus;
        const changed =
          displayStatus !== order.status ||
          gatewayStatus !== order.gatewayStatus ||
          (method !== '' && method !== order.method);

        if (changed) {
          const terminal = TERMINAL_STATUSES.has(order.status);
          const nextStatus = terminal
            ? order.status
            : displayStatus === 'PROCESSING' && order.receiptId
              ? 'SUCCESS'
              : displayStatus;
          order = {
            ...order,
            status: nextStatus,
            gatewayStatus,
            method: method || order.method,
            updatedAt: nowIso(),
          };
          await saveLocalOrder(order);

          await recordPaymentEvent(profileId, {
            orderId: order.orderId,
            status: order.status,
            gatewayStatus: order.gatewayStatus,
            method: order.method,
            source: 'gateway-poll',
            message: `Gateway reported ${gatewayStatus}.`,
          });
        }
      }
    }

    return {
      data: {
        ...order,
        paymentUrl: order.paymentUrl || order.checkoutUrl,
        events: await readPaymentEvents(profileId, order.orderId),
      },
    };
  });

  // POST /api/payments/:id/counter-confirm — the cashier confirms a cash or
  // card payment at the counter. YOUPI PG still owns the transition and emits
  // the authoritative webhook that creates the fee receipt.
  app.post('/api/payments/:id/counter-confirm', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { operatorId?: string };
    const profileId = await resolveProfileId(req);
    const order = await findLocalOrder(profileId, id);

    if (!order) return reply.code(404).send({ error: 'Payment not found' });
    if (!COUNTER_METHODS.has(order.method)) {
      return reply
        .code(400)
        .send({ error: 'Only cash or card counter payments can be confirmed here.' });
    }
    if (TERMINAL_STATUSES.has(order.status)) {
      return reply.code(409).send({ error: `Payment is already ${order.status}.` });
    }
    if (!order.paymentId) {
      return reply.code(400).send({ error: 'Payment session has no gateway id.' });
    }
    if (!YOUPI_ADMIN_TOKEN) {
      return reply
        .code(500)
        .send({ error: 'YOUPI_ADMIN_TOKEN is not configured in backend/.env.' });
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${YOUPI_API}/api/v1/admin/counter-confirm`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${YOUPI_ADMIN_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: order.paymentId,
          operatorId: body.operatorId?.trim() || 'fees-app',
          method: order.method,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      app.log.error({ err }, 'YOUPI PG counter confirmation unreachable');
      return reply.code(502).send({
        error: `Payment gateway unreachable. Is YOUPI PG running at ${YOUPI_API}?`,
      });
    }

    const json = (await upstream.json().catch(() => null)) as { error?: string } | null;
    if (!upstream.ok) {
      return reply.code(upstream.status).send({
        error: json?.error ?? 'The gateway rejected the counter confirmation.',
        details: json,
      });
    }

    const refreshed: LocalOrder = {
      ...order,
      status: order.receiptId ? 'SUCCESS' : 'PROCESSING',
      gatewayStatus: 'SUCCESS',
      updatedAt: nowIso(),
    };
    await saveLocalOrder(refreshed);

    await recordPaymentEvent(profileId, {
      orderId: order.orderId,
      status: refreshed.status,
      gatewayStatus: 'SUCCESS',
      method: order.method,
      source: 'counter-confirm',
      message: refreshed.receiptId
        ? 'Counter payment confirmed and the receipt is recorded.'
        : 'Counter payment confirmed; waiting for the signed webhook to create the receipt.',
    });

    return {
      data: { ...refreshed, events: await readPaymentEvents(profileId, order.orderId) },
    };
  });

  // POST /api/payments/:id/counter-decline — the cashier rejects a counter
  // payment (for example, cash was not actually received).
  app.post('/api/payments/:id/counter-decline', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { operatorId?: string; reason?: string };
    const profileId = await resolveProfileId(req);
    const order = await findLocalOrder(profileId, id);

    if (!order) return reply.code(404).send({ error: 'Payment not found' });
    if (!COUNTER_METHODS.has(order.method)) {
      return reply
        .code(400)
        .send({ error: 'Only cash or card counter payments can be declined here.' });
    }
    if (TERMINAL_STATUSES.has(order.status)) {
      return reply.code(409).send({ error: `Payment is already ${order.status}.` });
    }
    if (!order.paymentId) {
      return reply.code(400).send({ error: 'Payment session has no gateway id.' });
    }
    if (!YOUPI_ADMIN_TOKEN) {
      return reply
        .code(500)
        .send({ error: 'YOUPI_ADMIN_TOKEN is not configured in backend/.env.' });
    }

    const reason = body.reason?.trim() || 'Declined at the counter';
    let upstream: Response;
    try {
      upstream = await fetch(`${YOUPI_API}/api/v1/admin/counter-decline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${YOUPI_ADMIN_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: order.paymentId,
          operatorId: body.operatorId?.trim() || 'fees-app',
          reason,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      app.log.error({ err }, 'YOUPI PG counter decline unreachable');
      return reply.code(502).send({
        error: `Payment gateway unreachable. Is YOUPI PG running at ${YOUPI_API}?`,
      });
    }

    const json = (await upstream.json().catch(() => null)) as { error?: string } | null;
    if (!upstream.ok) {
      return reply.code(upstream.status).send({
        error: json?.error ?? 'The gateway rejected the counter decline.',
        details: json,
      });
    }

    const refreshed: LocalOrder = {
      ...order,
      status: 'FAILED',
      gatewayStatus: 'FAILED',
      updatedAt: nowIso(),
    };
    await saveLocalOrder(refreshed);

    await recordPaymentEvent(profileId, {
      orderId: order.orderId,
      status: 'FAILED',
      gatewayStatus: 'FAILED',
      method: order.method,
      source: 'counter-decline',
      message: reason,
    });

    return {
      data: { ...refreshed, events: await readPaymentEvents(profileId, order.orderId) },
    };
  });

  // POST /api/payments/webhook — authoritative YOUPI PG webhook receiver.
  app.post('/api/payments/webhook', async (req, reply) => {
    const raw = req.rawBody;
    if (!raw || raw.length === 0) {
      return reply.code(400).send({ error: 'Missing raw request body' });
    }

    if (!YOUPI_WEBHOOK_SECRET) {
      app.log.warn('YOUPI_WEBHOOK_SECRET is not configured; rejecting webhook');
      return reply.code(500).send({ error: 'Webhook secret not configured' });
    }

    const signature = String(req.headers['x-gateway-signature'] ?? '');
    const expected =
      'sha256=' + createHmac('sha256', YOUPI_WEBHOOK_SECRET).update(raw).digest('hex');
    const provided = Buffer.from(signature);
    const computed = Buffer.from(expected);
    const valid =
      provided.length === computed.length && timingSafeEqual(provided, computed);

    if (!valid) {
      return reply.code(401).send({ error: 'Invalid webhook signature' });
    }

    const payload = (req.body ?? {}) as WebhookPayload;
    const event = (payload.event ?? 'UNKNOWN').toUpperCase();
    const orderId = payload.orderId ?? '';
    if (!orderId.trim()) {
      return reply.code(400).send({ error: 'Webhook payload is missing orderId' });
    }
    const method = (payload.method ?? '').toUpperCase();
    const utr = payload.utr ?? '';
    const meta = payload.metadata ?? {};
    const metaFeeId = parseFeeId(meta.feeId);
    const metaStudentId = typeof meta.studentId === 'string' ? meta.studentId : '';
    const metaStudentName = typeof meta.studentName === 'string' ? meta.studentName : '';
    const metaProfileId =
      typeof meta.profileId === 'string' ? meta.profileId.trim() : '';

    // Prefer the profile echoed in metadata, then any stored order. There is no
    // user session on a webhook, so this is the only way to route the payment.
    let existing: LocalOrder | null = null;
    let profileId = '';
    if (isValidProfileId(metaProfileId)) {
      const profile = await getProfile(metaProfileId);
      if (profile) {
        profileId = metaProfileId;
        existing = await getLocalOrder(profileId, orderId);
      }
    }
    if (!existing) {
      const across = await findOrderAcrossProfiles(orderId);
      if (across) {
        existing = across;
        profileId = across.profileId;
      }
    }
    if (!profileId) profileId = SUPER_PROFILE_ID;

    // Only receipt money that was actually received.
    const moneyReceived = event === 'SUCCESS';

    // Hold the order at PROCESSING until the receipt exists, so the UI never
    // shows "paid" without its receipt being recorded.
    const statusForOrder = moneyReceived ? 'PROCESSING' : event;

    // Idempotent order upsert (deliveries may be retried).
    const timestamp = nowIso();
    const order: LocalOrder = existing
      ? {
          ...existing,
          profileId,
          paymentId: payload.paymentId ?? existing.paymentId,
          status:
            (existing.status === 'SUCCESS' || existing.status === 'REFUNDED') &&
            event !== 'REFUNDED'
              ? existing.status
              : statusForOrder,
          gatewayStatus:
            (existing.status === 'SUCCESS' || existing.status === 'REFUNDED') &&
            event !== 'REFUNDED'
              ? existing.gatewayStatus
              : event,
          method: method || existing.method,
          utr: utr || existing.utr,
          feeId: metaFeeId ?? existing.feeId,
          studentId: existing.studentId || metaStudentId,
          studentName: existing.studentName || metaStudentName,
          amount: existing.amount || payload.amount || '',
          updatedAt: timestamp,
        }
      : {
          profileId,
          orderId,
          paymentId: payload.paymentId ?? null,
          status: statusForOrder,
          gatewayStatus: event,
          method,
          utr,
          amount: payload.amount ?? '',
          studentId: metaStudentId,
          studentName: metaStudentName,
          feeId: metaFeeId,
          checkoutUrl: '',
          receiptId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
    await saveLocalOrder(order);

    await recordPaymentEvent(profileId, {
      orderId,
      status: order.status,
      gatewayStatus: order.gatewayStatus,
      method: order.method,
      source: 'webhook',
      message:
        moneyReceived && order.status === 'PROCESSING'
          ? 'Gateway verified the payment; creating the receipt.'
          : `Gateway reported ${event}.`,
    });

    if (moneyReceived) {
      let current = (await getLocalOrder(profileId, orderId)) ?? order;

      // Resolve the fee to mark paid: explicit id, else a matching pending fee.
      let feeId: number | null = metaFeeId ?? current.feeId ?? null;
      const paidAmount = Number(payload.amount ?? current.amount ?? '');
      if (feeId === null && Number.isFinite(paidAmount)) {
        const match = await findFeeByStudentAndAmount(
          profileId,
          current.studentName,
          paidAmount
        );
        feeId = match ? match.id : null;
      }
      if (feeId !== null) {
        const feeEntityId = scopedEntityId(profileId, String(feeId));
        const feeRecord = await getRecord<Fee>(FEES, feeEntityId);
        if (feeRecord && feeRecord.data.status !== 'paid') {
          await putRecord<Fee>(FEES, feeEntityId, {
            ...feeRecord.data,
            status: 'paid',
          });
        }
        // Remember a fuzzy-matched fee so a webhook retry cannot mark a
        // second fee for the same student/amount.
        if (current.feeId !== feeId) {
          current = { ...current, feeId, updatedAt: nowIso() };
          await saveLocalOrder(current);
        }
      }

      // Create exactly one receipt per order, even across webhook retries.
      try {
        await withReceiptLock(async () => {
          const latest = (await getLocalOrder(profileId, orderId)) ?? current;
          if (latest.receiptId) return;

          const receipts = await listReceipts(profileId);
          const existingReceipt = receipts.find((receipt) =>
            String(receipt.data.notes ?? '').includes(orderId)
          );
          if (existingReceipt) {
            existingReceipt.data.receiptId = existingReceipt.data.receiptId || existingReceipt.entityId;
            await saveLocalOrder({
              ...latest,
              receiptId: existingReceipt.data.receiptId,
              updatedAt: nowIso(),
            });
            return;
          }

          const receiptId = await nextReceiptId(profileId);
          const notes = `YOUPI PG${utr ? ` · UTR ${utr}` : ''} · Order ${orderId}`;
          const receipt: ReceiptRecord = {
            profileId,
            receiptId,
            studentId: latest.studentId || '',
            studentName: latest.studentName || metaStudentName,
            amount: payload.amount ?? latest.amount ?? '',
            method: receiptMethod(method || latest.method),
            paymentDate: paymentDate(payload.completedAt),
            status: 'Paid',
            notes,
          };
          await putRecord<ReceiptRecord>(
            RECEIPTS,
            scopedEntityId(profileId, receiptId),
            receipt
          );
          await saveLocalOrder({
            ...latest,
            receiptId,
            updatedAt: nowIso(),
          });
        });
      } catch (err) {
        app.log.error({ err, profileId }, 'Failed to create receipt for YOUPI payment');
        // Ask the gateway to retry: the receipt has not been recorded yet.
        return reply.code(500).send({ error: 'Could not record receipt' });
      }

      // Receipt and fee are durable now: publish the authoritative SUCCESS.
      const settled = (await getLocalOrder(profileId, orderId)) ?? current;
      const finalOrder: LocalOrder = {
        ...settled,
        profileId,
        status: event,
        gatewayStatus: event,
        updatedAt: nowIso(),
      };
      await saveLocalOrder(finalOrder);

      await recordPaymentEvent(profileId, {
        orderId,
        status: event,
        gatewayStatus: event,
        method,
        source: 'webhook',
        message: finalOrder.receiptId
          ? `Receipt ${finalOrder.receiptId} created and the fee is marked paid.`
          : 'Payment settled by the gateway.',
      });

      // Automatically send payment receipt confirmation to student WhatsApp if phone is available
      try {
        const wa = getWaState();
        if (wa.status === 'ready') {
          let recipientPhone = '';
          if (finalOrder.studentId) {
            const stuRec = await getRecord<{ phone?: string }>(
              APPWRITE_COLLECTIONS.students,
              scopedEntityId(profileId, finalOrder.studentId)
            );
            recipientPhone = stuRec?.data?.phone || '';
          }
          if (!recipientPhone && payload.metadata && typeof payload.metadata.phone === 'string') {
            recipientPhone = String(payload.metadata.phone);
          }
          if (recipientPhone) {
            const cleanPhone = recipientPhone.replace(/\D/g, '');
            if (cleanPhone.length >= 10) {
              const receiptText = `🎉 *Payment Confirmation - Receipt #${finalOrder.receiptId || 'Paid'}*\n\nDear ${finalOrder.studentName || 'Student / Parent'},\n\nWe have successfully received your fee payment of *₹${finalOrder.amount || payload.amount || '0'}*.\n\n• *Order ID:* ${orderId}\n• *Method:* ${method || 'UPI'}${utr ? `\n• *UTR / Ref:* ${utr}` : ''}\n• *Date:* ${paymentDate(payload.completedAt)}\n• *Status:* Confirmed (Paid)\n\nPlease find your official fee payment receipt attached in PDF format.\n\nThank you for your payment!\n— Accounts Desk`;

              const attachments: WaAttachment[] = [];
              try {
                let studentData: any = {};
                if (finalOrder.studentId) {
                  const stuRec = await getRecord<any>(
                    APPWRITE_COLLECTIONS.students,
                    scopedEntityId(profileId, finalOrder.studentId)
                  );
                  if (stuRec?.data) studentData = stuRec.data;
                }

                let orgName = 'MyFees Learning Center';
                const prof = await getProfile(profileId);
                if (prof?.name) orgName = prof.name;

                const pdfBuffer = await generateReceiptPdf({
                  receiptId: finalOrder.receiptId || orderId,
                  paymentDate: paymentDate(payload.completedAt),
                  amount: finalOrder.amount || payload.amount || '0',
                  method: method || 'UPI',
                  status: 'Paid',
                  orderId,
                  utr,
                  notes: `Fee payment confirmation for ${finalOrder.studentName || 'Student'}`,
                  student: {
                    studentId: finalOrder.studentId || '—',
                    studentName: finalOrder.studentName || studentData.studentName || 'Student',
                    phone: recipientPhone,
                    course: studentData.course || '',
                    group: studentData.group || '',
                    branch: studentData.branch || '',
                    guardian: studentData.guardian || '',
                  },
                  organization: {
                    name: orgName,
                  },
                });

                attachments.push({
                  name: `Receipt_${finalOrder.receiptId || orderId}.pdf`,
                  mime: 'application/pdf',
                  data: pdfBuffer.toString('base64'),
                });
              } catch (pdfErr) {
                app.log.warn({ pdfErr }, 'Could not generate receipt PDF for WhatsApp send');
              }

              void sendWaMessage(cleanPhone, receiptText, attachments).catch((err: any) => {
                app.log.warn({ err }, 'Could not send WhatsApp payment confirmation');
              });
            }
          }
        }
      } catch (err) {
        // Non-blocking
      }
    }

    return { received: true, event, orderId };
  });

  // GET /api/public/profile/:slug — read public workspace payment details for checkout page
  app.get('/api/public/profile/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const profile = await findProfileBySlug(slug);
    if (!profile) {
      return reply.code(404).send({ error: 'Organization or payment page not found' });
    }

    const settingsRecord = await getRecord<{
      upi_id?: string;
      payee_name?: string;
      qr_code_data_url?: string;
    }>(APPWRITE_COLLECTIONS.paymentSettings, scopedEntityId(profile.profileId, '1'));

    const bizRecord = await getRecord<{
      profile?: {
        media?: { logoUrl?: string; coverUrl?: string };
        phone?: string;
        email?: string;
        description?: string;
      };
    }>(APPWRITE_COLLECTIONS.businessProfiles, scopedEntityId(profile.profileId, '1'));

    const biz = bizRecord?.data?.profile;

    const studentRecords = await listScopedRecords<{
      studentId: string;
      studentName: string;
      group?: string;
      course?: string;
      phone?: string;
      email?: string;
      status?: string;
    }>(APPWRITE_COLLECTIONS.students, profile.profileId);

    const groupRecords = await listScopedRecords<{
      groupName?: string;
      feeAmount?: string | number;
    }>(APPWRITE_COLLECTIONS.studentGroups, profile.profileId);
    const feeMap = new Map<string, string>();
    for (const g of groupRecords) {
      if (g.data.groupName && g.data.feeAmount) {
        feeMap.set(g.data.groupName.toLowerCase(), String(g.data.feeAmount));
      }
    }

    const feeStructures = await listScopedRecords<{
      amount: string | number;
      courseGroup?: string;
      studentIds?: string[];
      status?: string;
    }>(APPWRITE_COLLECTIONS.feeStructures, profile.profileId);

    const getStudentFeeAmount = (s: { studentId: string; group?: string; course?: string }) => {
      for (const f of feeStructures) {
        if (f.data.studentIds?.includes(s.studentId) && f.data.amount) {
          return String(f.data.amount);
        }
      }
      if (s.group && feeMap.has(s.group.toLowerCase())) {
        return feeMap.get(s.group.toLowerCase())!;
      }
      for (const f of feeStructures) {
        if (
          (s.course && f.data.courseGroup?.toLowerCase().includes(s.course.toLowerCase())) ||
          (s.group && f.data.courseGroup?.toLowerCase().includes(s.group.toLowerCase()))
        ) {
          if (f.data.amount) return String(f.data.amount);
        }
      }
      return '5000';
    };

    const students = studentRecords
      .map((r) => r.data)
      .filter((s) => (s.status ?? 'Active').toLowerCase() !== 'inactive')
      .map((s) => ({
        studentId: s.studentId,
        studentName: s.studentName,
        group: s.group || '',
        course: s.course || '',
        phone: s.phone || '',
        email: s.email || '',
        feeAmount: getStudentFeeAmount(s),
      }));

    // A phone number is not a UPI handle. Only a saved, usable merchant VPA may
    // reach the public page; otherwise it must offer the counter. If the office
    // configured the VPA in YOUPI PG rather than in this workspace, reuse it so
    // the public link does not falsely report that UPI is unavailable.
    const savedUpi = settingsRecord?.data?.upi_id ?? '';
    let publicUpiId = isUsableUpiId(savedUpi) ? savedUpi.trim() : '';
    let publicPayeeName =
      settingsRecord?.data?.payee_name?.trim() || profile.name;

    if (!publicUpiId) {
      const gateway = await fetchGatewaySettings(2000);
      if (gateway.connected && isUsableUpiId(gateway.upiId)) {
        publicUpiId = gateway.upiId.trim();
        publicPayeeName = gateway.payeeName?.trim() || publicPayeeName;
      }
    }

    return {
      data: {
        profileId: profile.profileId,
        name: profile.name,
        ownerName: profile.ownerName,
        paymentUrl: profile.paymentUrl,
        upiId: publicUpiId,
        payeeName: publicPayeeName,
        qrCodeDataUrl: settingsRecord?.data?.qr_code_data_url ?? '',
        logoUrl: biz?.media?.logoUrl ?? '',
        phone: biz?.phone ?? '',
        email: biz?.email ?? profile.ownerEmail,
        description: biz?.description ?? '',
        students,
      },
    };
  });

  // GET /api/public/students/:slug — list active students for payment page dropdown
  app.get('/api/public/students/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const profile = await findProfileBySlug(slug);
    if (!profile) {
      return reply.code(404).send({ error: 'Organization not found' });
    }

    const studentRecords = await listScopedRecords<{
      studentId: string;
      studentName: string;
      group?: string;
      course?: string;
      phone?: string;
      email?: string;
      status?: string;
    }>(APPWRITE_COLLECTIONS.students, profile.profileId);

    const students = studentRecords
      .map((r) => r.data)
      .filter((s) => (s.status ?? 'Active').toLowerCase() !== 'inactive')
      .map((s) => ({
        studentId: s.studentId,
        studentName: s.studentName,
        group: s.group || '',
        course: s.course || '',
        phone: s.phone || '',
        email: s.email || '',
      }));

    return { data: students };
  });

  // POST /api/public/payments/create — public checkout creation by student/parent
  app.post('/api/public/payments/create', async (req, reply) => {
    const body = (req.body ?? {}) as CreatePaymentBody & { slug?: string; profileId?: string };
    const slug = (body.slug ?? body.profileId ?? '').trim();
    if (!slug) {
      return reply.code(400).send({ error: 'slug or profileId is required' });
    }

    const profile = await findProfileBySlug(slug);
    if (!profile) {
      return reply.code(404).send({ error: 'Organization not found' });
    }

    const profileId = profile.profileId;

    try {
      const { order, paymentUrl, initialStatus } = await createGatewayCheckout({
        profileId,
        orderId: body.orderId,
        studentId: body.studentId,
        studentName: body.studentName ?? '',
        amount: body.amount ?? 0,
        feeId: body.feeId ?? null,
        email: body.email,
        phone: body.phone,
        description:
          body.description ??
          `Fee payment for ${(body.studentName ?? '').trim()} - ${profile.name}`,
        method: body.method,
        source: 'fees-public-portal',
        eventMessage: `Online UPI checkout initiated by ${(body.studentName ?? '').trim()}.`,
      });

      return reply.send({
        data: {
          orderId: order.orderId,
          paymentId: order.paymentId,
          status: initialStatus,
          gatewayStatus: initialStatus,
          method: order.method,
          checkoutUrl: order.checkoutUrl,
          paymentUrl,
          amount: order.amount,
          currency: 'INR',
        },
      });
    } catch (err) {
      if (err instanceof GatewayCheckoutError) {
        app.log.warn(
          { err: err.message, code: err.code, profileId },
          'Public UPI checkout creation failed'
        );
        if (err.code === 'UPI_NOT_CONFIGURED') {
          return reply.code(err.statusCode).send({
            error:
              'Online UPI is not configured for this institution. Please pay at the counter.',
            code: err.code,
          });
        }
        if (err.code === 'PAYMENT_METHOD_NOT_ALLOWED') {
          return reply.code(err.statusCode).send({
            error: err.message,
            code: err.code,
          });
        }
      }
      return checkoutErrorReply(reply, err);
    }
  });

  // GET /api/public/payments/:id — public status poll for checkout page
  app.get('/api/public/payments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    let order = await findOrderAcrossProfiles(id);
    if (!order) {
      return reply.code(404).send({ error: 'Payment order not found' });
    }

    if (!TERMINAL_STATUSES.has(order.status)) {
      const gateway = await fetchGatewayPayment(order.paymentId, order.orderId);
      const gatewayStatus = (gateway?.internalStatus ?? gateway?.status ?? '').toUpperCase();
      if (gatewayStatus && KNOWN_STATUSES.has(gatewayStatus)) {
        const displayStatus =
          gatewayStatus === 'SUCCESS' && !order.receiptId ? 'PROCESSING' : gatewayStatus;
        if (displayStatus !== order.status || gatewayStatus !== order.gatewayStatus) {
          order = {
            ...order,
            status: displayStatus,
            gatewayStatus,
            updatedAt: nowIso(),
          };
          await saveLocalOrder(order);
        }
      }
    }

    return {
      data: {
        orderId: order.orderId,
        paymentId: order.paymentId,
        status: order.status,
        gatewayStatus: order.gatewayStatus,
        method: order.method,
        amount: order.amount,
        studentName: order.studentName,
        studentId: order.studentId,
        utr: order.utr,
        receiptId: order.receiptId,
        checkoutUrl: order.paymentUrl || order.checkoutUrl,
        paymentUrl: order.paymentUrl || order.checkoutUrl,
        createdAt: order.createdAt,
      },
    };
  });
}
