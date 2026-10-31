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
  PAYMENT_BASE_URL,
  paymentUrlFor,
} from '../tenant.js';
import {
  fetchGatewaySettings,
  getEffectiveCheckoutUpi,
  isUsableUpiId,
} from './payment-settings.js';
import { getWaState, sendWaMessage, waSessionKeyFor, type WaAttachment } from '../whatsapp.js';
import { generateReceiptPdf } from '../receipt-pdf.js';
import { buildReceiptPdfData } from './collections.js';
import { generateNextMonthBill } from '../billing.js';

const YOUPI_API = (process.env.YOUPI_PAYMENT_API_URL ?? 'http://localhost:6100').replace(/\/+$/, '');
const YOUPI_WEBHOOK_SECRET = process.env.YOUPI_WEBHOOK_SECRET ?? '';
const YOUPI_ADMIN_TOKEN = (process.env.YOUPI_ADMIN_TOKEN ?? '').trim();

/**
 * Executes a fetch against YOUPI PG with automatic retry on transient connection / network failures.
 * During deploys or server restarts, gateway services take 2-5 seconds to bind to ports.
 * Automatic retry prevents transient 502 GATEWAY_UNREACHABLE errors.
 */
async function fetchYoupiWithRetry(
  url: string,
  options: RequestInit,
  maxAttempts = 3,
  baseDelayMs = 600
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

export const TERMINAL_STATUSES = new Set<string>([
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
  upiId?: string;
  utr: string;
  payerVpa?: string;
  amount: string;
  studentId: string;
  studentName: string;
  institutionName?: string;
  feeId: number | null;
  checkoutUrl: string;
  paymentUrl?: string;
  receiptId: string | null;
  completedAt?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface GatewayPaymentView {
  status?: string;
  internalStatus?: string;
  method?: string;
  utr?: string;
  payeeVpa?: string;
  payerVpa?: string;
  completedAt?: string;
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
  orderId?: string;
  paymentId?: string;
  studentId: string;
  studentName: string;
  amount: string;
  method: string;
  upiId?: string;
  utr?: string;
  payerVpa?: string;
  institutionName?: string;
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
  returnUrl?: string;
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
    const upstream = await fetchYoupiWithRetry(`${YOUPI_API}/api/v1/payments/${encodeURIComponent(id)}`, {
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

interface SettlementDetail {
  orderId: string;
  event: string;
  method: string;
  utr: string;
  amount?: string;
  completedAt?: string;
  explicitFeeId?: number | null;
  metaStudentName?: string;
  metaPhone?: string;
}

/**
 * Settle a successful payment: mark the fee paid (flagging an OVERPAID
 * receipt when another order already settled the same fee), create exactly
 * one receipt (idempotent across retries), auto-generate the next month's
 * bill, and send the WhatsApp receipt notification. Shared by the signed
 * webhook and the reconciliation sweep so a lost webhook can be recovered
 * losslessly.
 * Returns null when the receipt could not be recorded — callers must ask
 * the sender to retry.
 */
async function settleSuccessPayment(
  app: FastifyInstance,
  profileId: string,
  order: LocalOrder,
  detail: SettlementDetail,
  source: string,
  waUserKey?: string
): Promise<{ order: LocalOrder; overpaid: boolean } | null> {
  const orderId = detail.orderId;
  let current = (await getLocalOrder(profileId, orderId)) ?? order;

  // Resolve the fee to mark paid: explicit id, then order linkage, else a
  // matching pending fee for the same student and amount.
  let feeId: number | null = detail.explicitFeeId ?? current.feeId ?? null;
  const paidAmount = Number(detail.amount ?? current.amount ?? '');
  if (feeId === null && Number.isFinite(paidAmount)) {
    const match = await findFeeByStudentAndAmount(
      profileId,
      current.studentName,
      paidAmount
    );
    feeId = match ? match.id : null;
  }

  // Overpayment detection: this payment succeeded but the same fee was
  // already settled by a different successful order. The money is real, so
  // it is still receipted — but flagged OVERPAID instead of silently
  // double-collecting.
  let overpaid = false;
  if (feeId !== null) {
    const feeEntityId = scopedEntityId(profileId, String(feeId));
    const feeRecord = await getRecord<Fee>(FEES, feeEntityId);
    if (feeRecord) {
      const orders = await listOrders(profileId);
      overpaid = orders.some(
        (other) =>
          other.feeId === feeId &&
          other.orderId !== orderId &&
          other.status === 'SUCCESS'
      );
      if (feeRecord.data.status !== 'paid') {
        const settledFee: Fee = { ...feeRecord.data, status: 'paid' };
        await putRecord<Fee>(FEES, feeEntityId, settledFee);
        // The next month's bill is generated automatically the moment this
        // one settles.
        await generateNextMonthBill(profileId, settledFee, 'settlement');
      }
    }
    // Remember a fuzzy-matched fee so a webhook retry cannot mark a second
    // fee for the same student/amount.
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
      const receiptMethodName = receiptMethod(detail.method || latest.method);
      const receiptUpi = latest.upiId || '';
      const receiptUtr = detail.utr || latest.utr;
      const notes = `YOUPI PG · Method: ${receiptMethodName}${receiptUpi ? ` · UPI: ${receiptUpi}` : ''}${receiptUtr ? ` · UTR: ${receiptUtr}` : ''} · Order: ${orderId}${overpaid ? ' · OVERPAID: fee already settled by another payment' : ''}`;
      const receipt: ReceiptRecord = {
        profileId,
        receiptId,
        orderId,
        paymentId: latest.paymentId || undefined,
        studentId: latest.studentId || '',
        studentName: latest.studentName || detail.metaStudentName || '',
        amount: detail.amount ?? latest.amount ?? '',
        method: receiptMethodName,
        upiId: receiptUpi || undefined,
        utr: receiptUtr || undefined,
        payerVpa: latest.payerVpa || undefined,
        institutionName: latest.institutionName || undefined,
        paymentDate: paymentDate(detail.completedAt),
        status: overpaid ? 'Overpaid' : 'Paid',
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
    // Tell the caller to retry: the receipt has not been recorded yet.
    return null;
  }

  // Receipt and fee are durable now: publish the authoritative SUCCESS.
  const settled = (await getLocalOrder(profileId, orderId)) ?? current;
  const finalOrder: LocalOrder = {
    ...settled,
    profileId,
    status: detail.event,
    gatewayStatus: detail.event,
    updatedAt: nowIso(),
  };
  await saveLocalOrder(finalOrder);

  await recordPaymentEvent(profileId, {
    orderId,
    status: detail.event,
    gatewayStatus: detail.event,
    method: detail.method,
    source,
    message: finalOrder.receiptId
      ? `Receipt ${finalOrder.receiptId} created${overpaid ? ' (OVERPAID — fee was already settled)' : ''} and the fee is marked paid.`
      : 'Payment settled by the gateway.',
  });

  // Automatically send payment receipt confirmation to student WhatsApp if
  // a phone number is available. Sent through the workspace OWNER's own
  // isolated WhatsApp session (each account owns its own connected number).
  try {
    const senderProfile = await getProfile(profileId);
    const waKey =
      (waUserKey ?? '').trim() ||
      (senderProfile?.ownerEmail ? String(senderProfile.ownerEmail).trim().toLowerCase() : '') ||
      waSessionKeyFor();
    const wa = getWaState(waKey);
    if (wa.status === 'ready') {
      let recipientPhone = '';
      if (finalOrder.studentId) {
        const stuRec = await getRecord<{ phone?: string }>(
          APPWRITE_COLLECTIONS.students,
          scopedEntityId(profileId, finalOrder.studentId)
        );
        recipientPhone = stuRec?.data?.phone || '';
      }
      if (!recipientPhone && detail.metaPhone) {
        recipientPhone = detail.metaPhone;
      }
      if (recipientPhone) {
        const cleanPhone = recipientPhone.replace(/\D/g, '');
        if (cleanPhone.length >= 10) {
          const receiptText = `🎉 *Payment Confirmation - Receipt #${finalOrder.receiptId || 'Paid'}*\n\nDear ${finalOrder.studentName || 'Student / Parent'},\n\nWe have successfully received your fee payment of *₹${finalOrder.amount || detail.amount || '0'}*.\n\n• *Order ID:* ${orderId}\n• *Method:* ${detail.method || 'UPI'}${detail.utr ? `\n• *UTR / Ref:* ${detail.utr}` : ''}\n• *Date:* ${paymentDate(detail.completedAt)}\n• *Status:* Confirmed (Paid)\n\nPlease find your official fee payment receipt attached in PDF format.\n\nThank you for your payment!\n— Accounts Desk`;

          const attachments: WaAttachment[] = [];
          try {
            const receiptPayload: any = {
              receiptId: finalOrder.receiptId || orderId,
              paymentDate: paymentDate(detail.completedAt),
              amount: finalOrder.amount || detail.amount || '0',
              method: detail.method || 'UPI',
              status: 'Paid',
              orderId,
              utr: detail.utr,
              payerVpa: finalOrder.payerVpa,
              studentId: finalOrder.studentId || '',
              studentName: finalOrder.studentName,
              notes: `Fee payment confirmation for ${finalOrder.studentName || 'Student'} · Order: ${orderId}${detail.utr ? ` · UTR: ${detail.utr}` : ''}`,
            };

            const pdfData = await buildReceiptPdfData(profileId, receiptPayload);
            const pdfBuffer = await generateReceiptPdf(pdfData);

            attachments.push({
              name: `Receipt_${finalOrder.receiptId || orderId}.pdf`,
              mime: 'application/pdf',
              data: pdfBuffer.toString('base64'),
            });
          } catch (pdfErr) {
            app.log.warn({ pdfErr }, 'Could not generate receipt PDF for WhatsApp send');
          }

          void sendWaMessage(cleanPhone, receiptText, attachments, undefined, waKey).catch((err: any) => {
            app.log.warn({ err }, 'Could not send WhatsApp payment confirmation');
          });
        }
      }
    }
  } catch (err) {
    // Non-blocking
  }

  return { order: finalOrder, overpaid };
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
  returnUrl?: string;
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

  // Duplicate-payment guard: never open a checkout for a fee that a previous
  // payment already settled. This is how one fee was collected twice (UPI +
  // cash) with two receipts for the same ₹10 bill.
  if (input.feeId !== null && input.feeId !== undefined) {
    const feeRecord = await getRecord<Fee>(
      FEES,
      scopedEntityId(input.profileId, String(input.feeId))
    );
    if (feeRecord && feeRecord.data.status === 'paid') {
      throw new GatewayCheckoutError(
        `Fee #${input.feeId} for ${feeRecord.data.student_name} is already paid. Duplicate payment blocked.`,
        409,
        'FEE_ALREADY_PAID'
      );
    }
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
  let effectiveUpiId = '';
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
    if (upi.upiId) effectiveUpiId = upi.upiId;
  }

  const orderId =
    input.orderId?.trim() || `FEE-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const amountStr = amount.toFixed(2);

  let merchantName = 'Institute Office';
  let profilePaymentUrl = '';
  try {
    const profile = await getProfile(input.profileId);
    if (profile?.name?.trim()) {
      merchantName = profile.name.trim();
    }
    if (profile?.paymentUrl?.trim()) {
      profilePaymentUrl = profile.paymentUrl.trim();
    } else if (profile?.profileId) {
      profilePaymentUrl = paymentUrlFor(profile.profileId, profile.name);
    }
  } catch {}

  const returnUrl = (input.returnUrl?.trim() || profilePaymentUrl || `${PAYMENT_BASE_URL}`).trim();

  const payload = {
    orderId,
    amount: amountStr,
    currency: 'INR',
    method,
    merchantName,
    returnUrl,
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
      upiId: effectiveUpiId || undefined,
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
    upstream = await fetchYoupiWithRetry(`${YOUPI_API}/api/v1/payments`, {
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
        upiId: effectiveUpiId || existing.upiId,
        institutionName: merchantName || existing.institutionName,
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
        upiId: effectiveUpiId,
        utr: '',
        amount: amountStr,
        studentId: input.studentId ?? '',
        studentName,
        institutionName: merchantName,
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
        const gatewayUtr = gateway?.utr || '';
        const gatewayPayeeVpa = gateway?.payeeVpa || '';
        const gatewayPayerVpa = gateway?.payerVpa || '';

        const changed =
          displayStatus !== order.status ||
          gatewayStatus !== order.gatewayStatus ||
          (method !== '' && method !== order.method) ||
          (Boolean(gatewayUtr) && gatewayUtr !== order.utr) ||
          (Boolean(gatewayPayeeVpa) && gatewayPayeeVpa !== order.upiId);

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
            utr: gatewayUtr || order.utr,
            upiId: gatewayPayeeVpa || order.upiId,
            payerVpa: gatewayPayerVpa || order.payerVpa,
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
  async function confirmOrderPayment(
    profileId: string,
    id: string,
    body: { operatorId?: string; utr?: string; method?: string; amount?: number | string; notes?: string }
  ): Promise<LocalOrder> {
    let order = await findLocalOrder(profileId, id);

    // If order not found by id, could it be a student ID (e.g. stu-STU-001 or STU-001)?
    if (!order) {
      const studentIdClean = id.replace(/^stu-/, '');
      const studentRecords = await listScopedRecords<{ studentId: string; studentName: string }>(
        APPWRITE_COLLECTIONS.students,
        profileId
      );
      const studentMatch = studentRecords.find(
        (s) =>
          s.data.studentId.toLowerCase() === studentIdClean.toLowerCase() ||
          s.data.studentName.toLowerCase() === studentIdClean.toLowerCase()
      );
      if (studentMatch) {
        const createRes = await createGatewayCheckout({
          profileId,
          studentId: studentMatch.data.studentId,
          studentName: studentMatch.data.studentName,
          amount: Number(body.amount) || 4500,
          method: body.method || 'UPI',
          source: 'dashboard-confirm',
        });
        order = createRes.order;
      }
    }

    if (!order) {
      throw new GatewayCheckoutError('Payment or student order not found', 404);
    }

    const confirmedMethod = body.method ? receiptMethod(body.method) : receiptMethod(order.method);
    const confirmedUtr = (body.utr ?? '').trim() || order.utr || '';

    // Notify gateway if session has paymentId
    if (order.paymentId && YOUPI_ADMIN_TOKEN) {
      try {
        await fetchYoupiWithRetry(`${YOUPI_API}/api/v1/admin/counter-confirm`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${YOUPI_ADMIN_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentId: order.paymentId,
            operatorId: body.operatorId?.trim() || 'fees-admin',
            method: order.method,
            utr: confirmedUtr,
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (err) {
        app.log.warn({ err }, 'Gateway admin confirm notification non-critical error');
      }
    }

    // Create or retrieve receipt
    let receiptId = order.receiptId;
    if (!receiptId) {
      // Overpayment detection: if a different successful order already
      // settled this fee, issue the receipt but flag it — money is real,
      // but the fee has been covered once already.
      let overpaid = false;
      if (order.feeId !== null && order.feeId !== undefined) {
        const feeRecord = await getRecord<Fee>(
          FEES,
          scopedEntityId(profileId, String(order.feeId))
        );
        if (feeRecord?.data.status === 'paid') {
          const orders = await listOrders(profileId);
          overpaid = orders.some(
            (other) =>
              other.feeId === order.feeId &&
              other.orderId !== order.orderId &&
              other.status === 'SUCCESS'
          );
        }
      }

      const receipts = await listReceipts(profileId);
      const existingReceipt = receipts.find((receipt) =>
        String(receipt.data.notes ?? '').includes(order.orderId)
      );
      if (existingReceipt) {
        receiptId = existingReceipt.data.receiptId || existingReceipt.entityId;
      } else {
        receiptId = await nextReceiptId(profileId);
        const receiptUpi = order.upiId || '';
        const notes = `YOUPI PG · Method: ${confirmedMethod}${receiptUpi ? ` · UPI: ${receiptUpi}` : ''}${confirmedUtr ? ` · UTR: ${confirmedUtr}` : ''} · Order: ${order.orderId}${overpaid ? ' · OVERPAID: fee already settled by another payment' : ''}`;
        const receipt: ReceiptRecord = {
          profileId,
          receiptId,
          orderId: order.orderId,
          paymentId: order.paymentId || undefined,
          studentId: order.studentId || '',
          studentName: order.studentName,
          amount: order.amount,
          method: confirmedMethod,
          upiId: receiptUpi || undefined,
          utr: confirmedUtr || undefined,
          institutionName: order.institutionName || undefined,
          paymentDate: paymentDate(),
          status: overpaid ? 'Overpaid' : 'Paid',
          notes,
        };
        await putRecord<ReceiptRecord>(RECEIPTS, scopedEntityId(profileId, receiptId), receipt);
      }
    }

    // Mark fee paid
    let feeId = order.feeId;
    if (feeId === null && Number.isFinite(Number(order.amount))) {
      const match = await findFeeByStudentAndAmount(profileId, order.studentName, Number(order.amount));
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
    }

    // Update order to SUCCESS
    const refreshed: LocalOrder = {
      ...order,
      status: 'SUCCESS',
      gatewayStatus: 'SUCCESS',
      receiptId,
      utr: confirmedUtr || order.utr,
      method: body.method ? (normalizePaymentMethod(body.method) || order.method) : order.method,
      completedAt: nowIso(),
      updatedAt: nowIso(),
    };
    await saveLocalOrder(refreshed);

    await recordPaymentEvent(profileId, {
      orderId: order.orderId,
      status: 'SUCCESS',
      gatewayStatus: 'SUCCESS',
      method: refreshed.method,
      source: 'admin-confirm',
      message: `Payment confirmed by admin/cashier. Receipt ${receiptId} issued.`,
    });

    return refreshed;
  }

  // POST /api/payments/:id/confirm — marks payment as paid, creates receipt, updates fee in Appwrite
  app.post('/api/payments/:id/confirm', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { operatorId?: string; utr?: string; method?: string; amount?: number | string; notes?: string };
    const profileId = await resolveProfileId(req);
    try {
      const order = await confirmOrderPayment(profileId, id, body);
      return {
        data: { ...order, events: await readPaymentEvents(profileId, order.orderId) },
      };
    } catch (err) {
      return checkoutErrorReply(reply, err);
    }
  });

  // POST /api/payments/:id/counter-confirm — cashier confirmation alias for any payment method
  app.post('/api/payments/:id/counter-confirm', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { operatorId?: string; utr?: string; method?: string; amount?: number | string };
    const profileId = await resolveProfileId(req);
    try {
      const order = await confirmOrderPayment(profileId, id, body);
      return {
        data: { ...order, events: await readPaymentEvents(profileId, order.orderId) },
      };
    } catch (err) {
      return checkoutErrorReply(reply, err);
    }
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
      upstream = await fetchYoupiWithRetry(`${YOUPI_API}/api/v1/admin/counter-decline`, {
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
    const meta = (payload.metadata ?? {}) as Record<string, unknown>;
    const metaFeeId = parseFeeId(meta.feeId);
    const metaStudentId = typeof meta.studentId === 'string' ? meta.studentId : '';
    const metaStudentName = typeof meta.studentName === 'string' ? meta.studentName : '';
    const metaProfileId =
      typeof meta.profileId === 'string' ? meta.profileId.trim() : '';
    const metaUpiId = typeof meta.upiId === 'string' ? meta.upiId : (typeof meta.payeeVpa === 'string' ? meta.payeeVpa : '');
    const metaPayerVpa = typeof meta.payerVpa === 'string' ? meta.payerVpa : '';
    const metaMerchantName = typeof meta.merchantName === 'string' ? meta.merchantName : '';

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

    // Only receipt money that was actually received. Per the YOUPI webhook
    // contract, SUCCESS with method COD carries NO money (cash on delivery
    // has not been collected yet) — it must never issue a receipt.
    const moneyReceived = event === 'SUCCESS' && method !== 'COD';

    // Hold the order at PROCESSING until the receipt exists, so the UI never
    // shows "paid" without its receipt being recorded.
    const statusForOrder = moneyReceived ? 'PROCESSING' : event;

    const effectiveUpiId = metaUpiId || existing?.upiId || '';
    const effectivePayerVpa = metaPayerVpa || existing?.payerVpa || '';
    const effectiveMerchantName = metaMerchantName || existing?.institutionName || '';

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
          upiId: effectiveUpiId,
          payerVpa: effectivePayerVpa,
          institutionName: effectiveMerchantName,
          feeId: metaFeeId ?? existing.feeId,
          studentId: existing.studentId || metaStudentId,
          studentName: existing.studentName || metaStudentName,
          amount: existing.amount || payload.amount || '',
          completedAt: payload.completedAt || existing.completedAt || timestamp,
          notes: `YOUPI PG · Method: ${method || existing.method || 'UPI'} · UTR: ${utr || existing.utr || 'N/A'}`,
          updatedAt: timestamp,
        }
      : {
          profileId,
          orderId,
          paymentId: payload.paymentId ?? null,
          status: statusForOrder,
          gatewayStatus: event,
          method,
          upiId: effectiveUpiId,
          utr,
          payerVpa: effectivePayerVpa,
          institutionName: effectiveMerchantName,
          amount: payload.amount ?? '',
          studentId: metaStudentId,
          studentName: metaStudentName,
          feeId: metaFeeId,
          checkoutUrl: '',
          receiptId: null,
          completedAt: payload.completedAt || timestamp,
          notes: `YOUPI PG · Method: ${method || 'UPI'} · UTR: ${utr || 'N/A'}`,
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
      const settledResult = await settleSuccessPayment(
        app,
        profileId,
        existing ?? order,
        {
          orderId,
          event,
          method,
          utr,
          amount: payload.amount,
          completedAt: payload.completedAt,
          explicitFeeId: metaFeeId,
          metaStudentName,
          metaPhone:
            payload.metadata && typeof payload.metadata.phone === 'string'
              ? payload.metadata.phone
              : undefined,
        },
        'webhook'
      );
      if (!settledResult) {
        // Ask the gateway to retry: the receipt has not been recorded yet.
        return reply.code(500).send({ error: 'Could not record receipt' });
      }
      if (settledResult.overpaid) {
        req.log.warn(
          { orderId, profileId },
          'OVERPAID: a different order already settled this fee — receipt flagged instead of silently double-collecting'
        );
      }
    }

    return { received: true, event, orderId };
  });

  // POST /api/payments/reconcile — recovery sweep for lost webhooks. Any
  // non-terminal order in this workspace whose gateway session already
  // reports SUCCESS but which never received its signed webhook (e.g. the
  // merchant webhook was misconfigured) is settled here through the exact
  // same code path as the webhook — receipt, fee, OVERPAID checks and all.
  app.post('/api/payments/reconcile', async (req, reply) => {
    const profileId = await resolveProfileId(req);
    const orders = await listOrders(profileId);
    const openOrders = orders.filter((o) => !TERMINAL_STATUSES.has(o.status));

    const settled: string[] = [];
    const failed: Array<{ orderId: string; error: string }> = [];
    for (const order of openOrders) {
      // A locally-settled order does not need recovery.
      if (order.receiptId) continue;

      const gateway = await fetchGatewayPayment(order.paymentId, order.orderId);
      const gatewayStatus = (gateway?.internalStatus ?? gateway?.status ?? '').toUpperCase();
      if (gatewayStatus !== 'SUCCESS') continue;

      const gatewayMethod = (gateway?.method ?? order.method ?? 'UPI').toUpperCase();
      // COD never carries money (see webhook contract) — skip it.
      if (gatewayMethod === 'COD') continue;

      const result = await settleSuccessPayment(
        app,
        profileId,
        order,
        {
          orderId: order.orderId,
          event: 'SUCCESS',
          method: gatewayMethod,
          utr: gateway?.utr ?? '',
          amount: order.amount,
          completedAt: gateway?.completedAt,
        },
        'reconciliation'
      );
      if (result) {
        settled.push(order.orderId);
      } else {
        failed.push({ orderId: order.orderId, error: 'receipt write failed; will retry' });
      }
    }

    if (settled.length > 0) {
      app.log.info(
        { profileId, settled, failedCount: failed.length },
        'Gateway reconciliation settled order(s) missing their webhook'
      );
    }
    return reply.send({
      data: {
        checked: openOrders.length,
        settled,
        settledCount: settled.length,
        failed,
      },
    });
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
        returnUrl: body.returnUrl,
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

  // GET /api/payments/:id/receipt/pdf — download receipt PDF for a payment order (authenticated)
  app.get('/api/payments/:id/receipt/pdf', async (req, reply) => {
    const { id } = req.params as { id: string };
    const profileId = await resolveProfileId(req);
    const order = await findLocalOrder(profileId, id);
    if (!order) {
      return reply.code(404).send({ error: 'Payment order not found' });
    }

    let receipt: any = null;
    if (order.receiptId) {
      const rec = await getRecord<any>(
        APPWRITE_COLLECTIONS.receipts,
        scopedEntityId(profileId, order.receiptId)
      );
      if (rec?.data) receipt = rec.data;
    }

    if (!receipt) {
      const allReceipts = await listScopedRecords<any>(
        APPWRITE_COLLECTIONS.receipts,
        profileId
      );
      const match = allReceipts.find(
        (r) =>
          (order.receiptId && r.data.receiptId === order.receiptId) ||
          String(r.data.notes || '').includes(order.orderId)
      );
      if (match?.data) receipt = match.data;
    }

    if (!receipt) {
      receipt = {
        receiptId: order.receiptId || `RCP-${order.orderId}`,
        studentId: order.studentId || '',
        studentName: order.studentName,
        amount: order.amount,
        method: receiptMethod(order.method),
        paymentDate: paymentDate(order.updatedAt),
        status: 'Paid',
        orderId: order.orderId,
        utr: order.utr,
        payerVpa: order.payerVpa,
        notes: `Order: ${order.orderId}${order.utr ? ` · UTR: ${order.utr}` : ''}`,
      };
    }

    const pdfData = await buildReceiptPdfData(profileId, receipt);
    const pdfBuffer = await generateReceiptPdf(pdfData);

    return reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `inline; filename="Receipt-${receipt.receiptId}.pdf"`
      )
      .send(pdfBuffer);
  });

  // GET /api/public/payments/:id/receipt/pdf — public receipt download for an order
  app.get('/api/public/payments/:id/receipt/pdf', async (req, reply) => {
    const { id } = req.params as { id: string };
    const order = await findOrderAcrossProfiles(id);
    if (!order) {
      return reply.code(404).send({ error: 'Payment order not found' });
    }

    const profileId = order.profileId || 'ORG-KRG73BEG';
    let receipt: any = null;
    if (order.receiptId) {
      const rec = await getRecord<any>(
        APPWRITE_COLLECTIONS.receipts,
        scopedEntityId(profileId, order.receiptId)
      );
      if (rec?.data) receipt = rec.data;
    }

    if (!receipt) {
      receipt = {
        receiptId: order.receiptId || `RCP-${order.orderId}`,
        studentId: order.studentId || '',
        studentName: order.studentName,
        amount: order.amount,
        method: receiptMethod(order.method),
        paymentDate: paymentDate(order.updatedAt),
        status: 'Paid',
        orderId: order.orderId,
        utr: order.utr,
        payerVpa: order.payerVpa,
        notes: `Order: ${order.orderId}${order.utr ? ` · UTR: ${order.utr}` : ''}`,
      };
    }

    const pdfData = await buildReceiptPdfData(profileId, receipt);
    const pdfBuffer = await generateReceiptPdf(pdfData);

    return reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `inline; filename="Receipt-${receipt.receiptId}.pdf"`
      )
      .send(pdfBuffer);
  });
}
