import type { FastifyInstance } from 'fastify';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  APPWRITE_COLLECTIONS,
  getRecord,
  listRecords,
  putRecord,
} from '../appwrite.js';
import type { Fee } from '../schemas.js';
import { ensureGatewayUpiSynced } from './payment-settings.js';

const YOUPI_API = (process.env.YOUPI_PAYMENT_API_URL ?? 'http://localhost:6100').replace(/\/+$/, '');
const YOUPI_WEBHOOK_SECRET = process.env.YOUPI_WEBHOOK_SECRET ?? '';
const YOUPI_ADMIN_TOKEN = (process.env.YOUPI_ADMIN_TOKEN ?? '').trim();

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

async function getLocalOrder(orderId: string): Promise<LocalOrder | null> {
  const record = await getRecord<LocalOrder>(ORDERS, orderId);
  return record?.data ?? null;
}

async function listOrders(): Promise<LocalOrder[]> {
  const records = await listRecords<LocalOrder>(ORDERS);
  return records
    .map((record) => record.data)
    .sort((a, b) =>
      String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
    );
}

async function findLocalOrder(id: string): Promise<LocalOrder | null> {
  const direct = await getLocalOrder(id);
  if (direct) return direct;
  const orders = await listOrders();
  return orders.find((order) => order.paymentId === id) ?? null;
}

async function saveLocalOrder(order: LocalOrder): Promise<void> {
  await putRecord(ORDERS, order.orderId, order);
}

async function readPaymentEvents(orderId: string): Promise<PaymentEventRow[]> {
  const records = await listRecords<PaymentEventRow>(EVENTS);
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
async function recordPaymentEvent(input: {
  orderId: string;
  status: string;
  gatewayStatus?: string;
  method?: string;
  source: string;
  message?: string;
}): Promise<void> {
  const gatewayStatus = input.gatewayStatus ?? '';
  const events = await readPaymentEvents(input.orderId);
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
    id: randomUUID(),
    orderId: input.orderId,
    status: input.status,
    gatewayStatus,
    method: input.method ?? '',
    source: input.source,
    message: input.message ?? '',
    createdAt: nowIso(),
  };
  await putRecord(EVENTS, event.id, event);
}

async function listReceipts(): Promise<Array<{ entityId: string; data: ReceiptRecord }>> {
  const records = await listRecords<ReceiptRecord>(RECEIPTS);
  return records.map((record) => ({ entityId: record.entityId, data: record.data }));
}

async function nextReceiptId(): Promise<string> {
  const receipts = await listReceipts();
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
  studentName: string,
  amount: number
): Promise<Fee | null> {
  const records = await listRecords<Fee>(FEES);
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

export async function paymentRoutes(app: FastifyInstance) {
  // POST /api/payments/create — open a YOUPI PG checkout session for a fee.
  app.post('/api/payments/create', async (req, reply) => {
    const body = (req.body ?? {}) as CreatePaymentBody;

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return reply.code(400).send({ error: 'A valid positive amount is required' });
    }

    const studentName = (body.studentName ?? '').trim();
    if (!studentName) {
      return reply.code(400).send({ error: 'studentName is required' });
    }

    const method = normalizePaymentMethod(body.method);
    if (!method) {
      return reply.code(400).send({
        error: 'Invalid payment method. Use UPI, CASH_COUNTER, or CARD_COUNTER.',
      });
    }

    const orderId = body.orderId?.trim() || `FEE-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const amountStr = amount.toFixed(2);

    const payload = {
      orderId,
      amount: amountStr,
      currency: 'INR',
      method,
      customer: {
        name: studentName,
        ...(body.email ? { email: body.email } : {}),
        ...(body.phone ? { phoneNumber: body.phone } : {}),
      },
      description: body.description ?? `Fee payment for ${studentName}`,
      metadata: {
        studentId: body.studentId ?? '',
        studentName,
        feeId: body.feeId ?? null,
        source: 'fees-monorepo',
      },
    };

    // A save made while YOUPI PG was offline is retried here, so the new
    // checkout uses the UPI ID shown in the fees app.
    const upiSync = await ensureGatewayUpiSynced();
    if (upiSync?.error) {
      app.log.warn(
        { gatewayError: upiSync.error },
        'YOUPI PG UPI settings were not synced before checkout'
      );
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${YOUPI_API}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': orderId,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      app.log.error({ err }, 'YOUPI PG payment gateway unreachable');
      return reply.code(502).send({
        error: `Payment gateway unreachable. Is YOUPI PG running at ${YOUPI_API}?`,
      });
    }

    const json = (await upstream.json().catch(() => null)) as UpstreamPayment | null;
    if (!upstream.ok || !json) {
      return reply.code(upstream.ok ? 502 : upstream.status).send({
        error: json?.error ?? json?.message ?? 'Failed to create payment session',
        details: json,
      });
    }

    const initialStatus = json.status ?? 'INITIATED';
    const existing = await getLocalOrder(orderId);
    const timestamp = nowIso();
    // Reusing an order id must not regress a settled/terminal local record if
    // the gateway returns the original session for the same idempotency key.
    const alreadyTerminal = existing ? TERMINAL_STATUSES.has(existing.status) : false;
    const order: LocalOrder = existing
      ? {
          ...existing,
          paymentId: json.paymentId ?? existing.paymentId,
          status: alreadyTerminal ? existing.status : initialStatus,
          gatewayStatus: alreadyTerminal ? existing.gatewayStatus : initialStatus,
          method,
          checkoutUrl: json.checkoutUrl ?? existing.checkoutUrl,
          updatedAt: timestamp,
        }
      : {
          orderId,
          paymentId: json.paymentId ?? null,
          status: initialStatus,
          gatewayStatus: initialStatus,
          method,
          utr: '',
          amount: amountStr,
          studentId: body.studentId ?? '',
          studentName,
          feeId: body.feeId ?? null,
          checkoutUrl: json.checkoutUrl ?? '',
          receiptId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
    await saveLocalOrder(order);

    await recordPaymentEvent({
      orderId,
      status: initialStatus,
      gatewayStatus: initialStatus,
      method,
      source: 'create',
      message: `${method.replace('_', ' ')} payment session created.`,
    });

    return reply.code(upstream.ok ? 200 : 201).send({
      data: {
        orderId,
        paymentId: json.paymentId,
        status: initialStatus,
        gatewayStatus: initialStatus,
        method,
        checkoutUrl: order.checkoutUrl,
        amount: amountStr,
        currency: json.currency ?? 'INR',
      },
    });
  });

  // GET /api/payments — list payment sessions created through this app.
  app.get('/api/payments', async () => {
    return { data: await listOrders() };
  });

  // GET /api/payments/:id — local record first, then reconcile display status
  // with the gateway. The webhook remains the only path that settles money.
  app.get('/api/payments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    let order = await findLocalOrder(id);

    if (order && !TERMINAL_STATUSES.has(order.status)) {
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

          await recordPaymentEvent({
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

    if (order) {
      return { data: { ...order, events: await readPaymentEvents(order.orderId) } };
    }

    // Unknown locally: fall back to the gateway's public view.
    try {
      const headers: Record<string, string> = {};
      if (YOUPI_WEBHOOK_SECRET) headers['X-Merchant-Key'] = YOUPI_WEBHOOK_SECRET;
      const upstream = await fetch(`${YOUPI_API}/api/v1/payments/${encodeURIComponent(id)}`, {
        headers,
      });
      const json = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        return reply.code(upstream.status).send({ error: 'Payment not found', details: json });
      }
      return { data: { ...(json ?? {}), events: [] } };
    } catch {
      return reply.code(502).send({ error: 'Payment gateway unreachable' });
    }
  });

  // POST /api/payments/:id/counter-confirm — the cashier confirms a cash or
  // card payment at the counter. YOUPI PG still owns the transition and emits
  // the authoritative webhook that creates the fee receipt.
  app.post('/api/payments/:id/counter-confirm', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { operatorId?: string };
    const order = await findLocalOrder(id);

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

    await recordPaymentEvent({
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
      data: { ...refreshed, events: await readPaymentEvents(order.orderId) },
    };
  });

  // POST /api/payments/:id/counter-decline — the cashier rejects a counter
  // payment (for example, cash was not actually received).
  app.post('/api/payments/:id/counter-decline', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { operatorId?: string; reason?: string };
    const order = await findLocalOrder(id);

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

    await recordPaymentEvent({
      orderId: order.orderId,
      status: 'FAILED',
      gatewayStatus: 'FAILED',
      method: order.method,
      source: 'counter-decline',
      message: reason,
    });

    return {
      data: { ...refreshed, events: await readPaymentEvents(order.orderId) },
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

    // Only receipt money that was actually received.
    const moneyReceived = event === 'SUCCESS';

    // Hold the order at PROCESSING until the receipt exists, so the UI never
    // shows "paid" without its receipt being recorded.
    const statusForOrder = moneyReceived ? 'PROCESSING' : event;

    // Idempotent order upsert (deliveries may be retried).
    const existing = await getLocalOrder(orderId);
    const timestamp = nowIso();
    const order: LocalOrder = existing
      ? {
          ...existing,
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

    await recordPaymentEvent({
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
      let current = (await getLocalOrder(orderId)) ?? order;

      // Resolve the fee to mark paid: explicit id, else a matching pending fee.
      let feeId: number | null = metaFeeId ?? current.feeId ?? null;
      const paidAmount = Number(payload.amount ?? current.amount ?? '');
      if (feeId === null && Number.isFinite(paidAmount)) {
        const match = await findFeeByStudentAndAmount(current.studentName, paidAmount);
        feeId = match ? match.id : null;
      }
      if (feeId !== null) {
        const feeRecord = await getRecord<Fee>(FEES, String(feeId));
        if (feeRecord && feeRecord.data.status !== 'paid') {
          await putRecord<Fee>(FEES, String(feeId), {
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
          const latest = (await getLocalOrder(orderId)) ?? current;
          if (latest.receiptId) return;

          const receipts = await listReceipts();
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

          const receiptId = await nextReceiptId();
          const notes = `YOUPI PG${utr ? ` · UTR ${utr}` : ''} · Order ${orderId}`;
          const receipt: ReceiptRecord = {
            receiptId,
            studentId: latest.studentId || '',
            studentName: latest.studentName || metaStudentName,
            amount: payload.amount ?? latest.amount ?? '',
            method: receiptMethod(method || latest.method),
            paymentDate: paymentDate(payload.completedAt),
            status: 'Paid',
            notes,
          };
          await putRecord<ReceiptRecord>(RECEIPTS, receiptId, receipt);
          await saveLocalOrder({
            ...latest,
            receiptId,
            updatedAt: nowIso(),
          });
        });
      } catch (err) {
        app.log.error({ err }, 'Failed to create receipt for YOUPI payment');
        // Ask the gateway to retry: the receipt has not been recorded yet.
        return reply.code(500).send({ error: 'Could not record receipt' });
      }

      // Receipt and fee are durable now: publish the authoritative SUCCESS.
      const settled = (await getLocalOrder(orderId)) ?? current;
      const finalOrder: LocalOrder = {
        ...settled,
        status: event,
        gatewayStatus: event,
        updatedAt: nowIso(),
      };
      await saveLocalOrder(finalOrder);

      await recordPaymentEvent({
        orderId,
        status: event,
        gatewayStatus: event,
        method,
        source: 'webhook',
        message: finalOrder.receiptId
          ? `Receipt ${finalOrder.receiptId} created and the fee is marked paid.`
          : 'Payment settled by the gateway.',
      });
    }

    return { received: true, event, orderId };
  });
}
