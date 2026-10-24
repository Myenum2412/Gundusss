import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { pool, query } from '../db.js';
import { ensureGatewayUpiSynced } from './payment-settings.js';

const YOUPI_API = (process.env.YOUPI_PAYMENT_API_URL ?? 'http://localhost:6100').replace(/\/+$/, '');
const YOUPI_WEBHOOK_SECRET = process.env.YOUPI_WEBHOOK_SECRET ?? '';
const YOUPI_ADMIN_TOKEN = (process.env.YOUPI_ADMIN_TOKEN ?? '').trim();

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

/**
 * Reads the gateway's view with merchant-owner credentials. Status polling is
 * display-only: receipts and fee marks still come exclusively from the signed
 * webhook.
 */
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

const ORDER_SELECT = `
  SELECT order_id AS "orderId", payment_id AS "paymentId",
         status, gateway_status AS "gatewayStatus", method, utr,
         amount, student_id AS "studentId", student_name AS "studentName",
         fee_id AS "feeId", checkout_url AS "checkoutUrl", receipt_id AS "receiptId",
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
         to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
  FROM payment_orders`;

async function refreshLocalOrder(orderId: string): Promise<LocalOrder | null> {
  const rows = await query<LocalOrder>(`${ORDER_SELECT} WHERE order_id = $1 LIMIT 1`, [orderId]);
  return rows[0] ?? null;
}

async function findLocalOrder(id: string): Promise<LocalOrder | null> {
  const rows = await query<LocalOrder>(
    `${ORDER_SELECT} WHERE payment_id = $1 OR order_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
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
  const last = await query<{ status: string; gateway_status: string; source: string }>(
    `SELECT status, gateway_status, source
     FROM payment_events
     WHERE order_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [input.orderId]
  );
  const previous = last[0];
  if (
    previous &&
    previous.status === input.status &&
    previous.gateway_status === gatewayStatus &&
    previous.source === input.source
  ) {
    return;
  }

  await query(
    `INSERT INTO payment_events (order_id, status, gateway_status, method, source, message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.orderId,
      input.status,
      gatewayStatus,
      input.method ?? '',
      input.source,
      input.message ?? '',
    ]
  );
}

async function readPaymentEvents(orderId: string): Promise<PaymentEventRow[]> {
  return query<PaymentEventRow>(
    `SELECT id, order_id AS "orderId", status, gateway_status AS "gatewayStatus",
            method, source, message,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
     FROM payment_events
     WHERE order_id = $1
     ORDER BY created_at ASC, id ASC`,
    [orderId]
  );
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

interface OrderRow {
  order_id: string;
  student_id: string;
  student_name: string;
  fee_id: number | null;
  amount: string;
  receipt_id: string | null;
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

async function nextReceiptId(client: PoolClient): Promise<string> {
  const { rows } = await client.query<{ next_num: number | string }>(
    "SELECT COALESCE(MAX(NULLIF(regexp_replace(receipt_id, '[^0-9]', '', 'g'), '')::int), 0) + 1 AS next_num FROM receipts"
  );
  const next = Number(rows[0]?.next_num ?? 1);
  return `RCP-${String(next).padStart(3, '0')}`;
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
    await query(
      `INSERT INTO payment_orders (order_id, payment_id, student_id, student_name, fee_id, amount, status, gateway_status, method, checkout_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         payment_id = EXCLUDED.payment_id,
         status = EXCLUDED.status,
         gateway_status = EXCLUDED.gateway_status,
         method = EXCLUDED.method,
         checkout_url = EXCLUDED.checkout_url,
         updated_at = NOW()`,
      [
        orderId,
        json.paymentId ?? null,
        body.studentId ?? '',
        studentName,
        body.feeId ?? null,
        amountStr,
        initialStatus,
        method,
        json.checkoutUrl ?? '',
      ]
    );

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
        checkoutUrl: json.checkoutUrl,
        amount: amountStr,
        currency: json.currency ?? 'INR',
      },
    });
  });

  // GET /api/payments — list payment sessions created through this app.
  app.get('/api/payments', async () => {
    const rows = await query(`${ORDER_SELECT} ORDER BY created_at DESC`);
    return { data: rows };
  });

  // GET /api/payments/:id — local record first, then reconcile display status
  // with the gateway. The webhook remains the only path that settles money.
  app.get('/api/payments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const rows = await query<LocalOrder>(
      `${ORDER_SELECT} WHERE payment_id = $1 OR order_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [id]
    );
    let order = rows[0];

    if (order && !TERMINAL_STATUSES.has(order.status)) {
      const gateway = await fetchGatewayPayment(order.paymentId, order.orderId);
      const gatewayStatus = (gateway?.internalStatus ?? gateway?.status ?? '').toUpperCase();

      if (gatewayStatus && KNOWN_STATUSES.has(gatewayStatus)) {
        // A gateway SUCCESS without a receipt stays PROCESSING until the signed
        // webhook lands and creates the receipt. The CASE also stops a slow
        // poll from regressing a webhook-settled SUCCESS.
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
          await query(
            `UPDATE payment_orders
             SET status = CASE
                   WHEN status IN ('SUCCESS','FAILED','EXPIRED','CANCELLED','CANCELED','SUSPICIOUS','BLOCKED','REFUNDED')
                     THEN status
                   WHEN $1 = 'PROCESSING' AND receipt_id IS NOT NULL THEN 'SUCCESS'
                   ELSE $1
                 END,
                 gateway_status = $2,
                 method = COALESCE(NULLIF($3, ''), method),
                 updated_at = NOW()
             WHERE order_id = $4`,
            [displayStatus, gatewayStatus, method, order.orderId]
          );
          order = (await refreshLocalOrder(order.orderId)) ?? order;

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

    await query(
      `UPDATE payment_orders
       SET status = CASE WHEN receipt_id IS NOT NULL THEN 'SUCCESS' ELSE 'PROCESSING' END,
           gateway_status = 'SUCCESS',
           updated_at = NOW()
       WHERE order_id = $1`,
      [order.orderId]
    );

    const refreshed = (await refreshLocalOrder(order.orderId)) ?? order;
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

    await query(
      `UPDATE payment_orders
       SET status = 'FAILED', gateway_status = 'FAILED', updated_at = NOW()
       WHERE order_id = $1`,
      [order.orderId]
    );

    const refreshed = (await refreshLocalOrder(order.orderId)) ?? order;
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
    await query(
      `INSERT INTO payment_orders (order_id, payment_id, student_id, student_name, fee_id, amount, status, gateway_status, method, utr)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $10, $8, $9)
       ON CONFLICT (order_id) DO UPDATE SET
         payment_id = COALESCE(EXCLUDED.payment_id, payment_orders.payment_id),
         status = CASE
           WHEN payment_orders.status IN ('SUCCESS','REFUNDED') AND EXCLUDED.status <> 'REFUNDED'
             THEN payment_orders.status
           ELSE EXCLUDED.status
         END,
         gateway_status = CASE
           WHEN payment_orders.status IN ('SUCCESS','REFUNDED') AND EXCLUDED.gateway_status <> 'REFUNDED'
             THEN payment_orders.gateway_status
           ELSE EXCLUDED.gateway_status
         END,
         method = COALESCE(NULLIF(EXCLUDED.method, ''), payment_orders.method),
         utr = CASE WHEN EXCLUDED.utr <> '' THEN EXCLUDED.utr ELSE payment_orders.utr END,
         fee_id = COALESCE(EXCLUDED.fee_id, payment_orders.fee_id),
         student_id = COALESCE(NULLIF(payment_orders.student_id, ''), EXCLUDED.student_id),
         student_name = COALESCE(NULLIF(payment_orders.student_name, ''), EXCLUDED.student_name),
         updated_at = NOW()`,
      [
        orderId,
        payload.paymentId ?? null,
        metaStudentId,
        metaStudentName,
        metaFeeId,
        payload.amount ?? '',
        statusForOrder,
        method,
        utr,
        event,
      ]
    );

    const currentRows = await query<{
      status: string;
      gateway_status: string;
      method: string;
    }>(
      `SELECT status, gateway_status, method
       FROM payment_orders WHERE order_id = $1`,
      [orderId]
    );
    const currentStatus = currentRows[0]?.status ?? statusForOrder;
    const currentGatewayStatus = currentRows[0]?.gateway_status ?? event;
    const currentMethod = currentRows[0]?.method ?? method;

    await recordPaymentEvent({
      orderId,
      status: currentStatus,
      gatewayStatus: currentGatewayStatus,
      method: currentMethod,
      source: 'webhook',
      message:
        moneyReceived && currentStatus === 'PROCESSING'
          ? 'Gateway verified the payment; creating the receipt.'
          : `Gateway reported ${event}.`,
    });

    if (moneyReceived) {
      const rows = await query<OrderRow>(
        `SELECT order_id, student_id, student_name, fee_id, amount, receipt_id
         FROM payment_orders WHERE order_id = $1`,
        [orderId]
      );
      const order = rows[0];

      // Resolve the fee to mark paid: explicit id, else a matching pending fee.
      let feeId: number | null = metaFeeId ?? order?.fee_id ?? null;
      const paidAmount = Number(payload.amount ?? order?.amount ?? '');
      if (feeId === null && order && Number.isFinite(paidAmount)) {
        const match = await query<{ id: number }>(
          `SELECT id FROM fees
           WHERE status <> 'paid'
             AND lower(student_name) = lower($1)
             AND amount = $2::numeric
           ORDER BY id DESC LIMIT 1`,
          [order.student_name, paidAmount]
        );
        feeId = match[0]?.id ?? null;
      }
      if (feeId !== null) {
        await query("UPDATE fees SET status = 'paid' WHERE id = $1", [feeId]);
        // Remember a fuzzy-matched fee so a webhook retry cannot mark a
        // second fee for the same student/amount.
        if (order && order.fee_id !== feeId) {
          await query(
            'UPDATE payment_orders SET fee_id = $1, updated_at = NOW() WHERE order_id = $2',
            [feeId, orderId]
          );
        }
      }

      // Create exactly one receipt per order, even across webhook retries.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query<{ receipt_id: string | null }>(
          'SELECT receipt_id FROM payment_orders WHERE order_id = $1 FOR UPDATE',
          [orderId]
        );

        if (!locked.rows[0]?.receipt_id) {
          // Serialize receipt-ID allocation so concurrent webhooks cannot
          // compute the same RCP-00x number.
          await client.query('LOCK TABLE receipts IN SHARE ROW EXCLUSIVE MODE');
          const receiptId = await nextReceiptId(client);
          await client.query(
            `INSERT INTO receipts (receipt_id, student_id, student_name, amount, method, payment_date, status, notes)
             VALUES ($1, $2, $3, $4, $5, $6, 'Paid', $7)`,
            [
              receiptId,
              order?.student_id ?? '',
              order?.student_name ?? metaStudentName,
              payload.amount ?? order?.amount ?? '',
              receiptMethod(method),
              paymentDate(payload.completedAt),
              `YOUPI PG${utr ? ` · UTR ${utr}` : ` · Order ${orderId}`}`,
            ]
          );
          await client.query(
            'UPDATE payment_orders SET receipt_id = $1, updated_at = NOW() WHERE order_id = $2',
            [receiptId, orderId]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        app.log.error({ err }, 'Failed to create receipt for YOUPI payment');
        // Ask the gateway to retry: the receipt has not been recorded yet.
        return reply.code(500).send({ error: 'Could not record receipt' });
      } finally {
        client.release();
      }

      // Receipt and fee are durable now: publish the authoritative SUCCESS.
      await query(
        'UPDATE payment_orders SET status = $1, gateway_status = $1, updated_at = NOW() WHERE order_id = $2',
        [event, orderId]
      );

      const settled = await query<{ receipt_id: string | null }>(
        'SELECT receipt_id FROM payment_orders WHERE order_id = $1',
        [orderId]
      );
      await recordPaymentEvent({
        orderId,
        status: event,
        gatewayStatus: event,
        method,
        source: 'webhook',
        message: settled[0]?.receipt_id
          ? `Receipt ${settled[0].receipt_id} created and the fee is marked paid.`
          : 'Payment settled by the gateway.',
      });
    }

    return { received: true, event, orderId };
  });
}
