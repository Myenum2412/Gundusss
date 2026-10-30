import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getWaState, startWa, logoutWa, sendWaMessage, waSessionKeyFor } from '../whatsapp.js';

const AttachmentSchema = z
  .object({
    name: z.string().min(1).max(200),
    mime: z.string().min(1).max(120),
    // base64 payload; ~4.5MB covers common PDFs/images within the 5MB body limit
    data: z.string().min(8).max(6_500_000),
  })
  .strip();

const CtaSchema = z
  .object({
    displayText: z.string().min(1).max(100),
    url: z.string().url().max(1000),
  })
  .strip();

const SendSchema = z.object({
  to: z.string().min(10).max(20),
  // Empty message is allowed when the request carries a file or button instead.
  message: z.string().max(4000),
  attachment: AttachmentSchema.optional(),
  cta: CtaSchema.optional(),
  // Optional account email — lets machine-to-machine callers (payment
  // gateway bridge) target a specific user's WhatsApp session. Omitted means the
  // fixed super admin session (system sender).
  userEmail: z.string().optional(),
});

/** Resolve the WhatsApp session key that owns this request.
 *
 * Every signed-in user gets their OWN isolated WhatsApp session (own auth dir,
 * QR, socket, status, send queue). System senders pass no user and fall back to
 * the fixed super admin session. */
function sessionKeyFor(req: FastifyRequest): string {
  return waSessionKeyFor(req.auth?.email);
}

/** Shared secret the payment gateway presents when it asks this app to send an OTP. */
function bridgeToken(): string {
  return (
    process.env.WHATSAPP_BRIDGE_TOKEN?.trim() ||
    process.env.YOUPI_WEBHOOK_SECRET?.trim() ||
    ''
  );
}

function secureEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return ha.length === hb.length && timingSafeEqual(ha, hb);
}

export async function whatsappRoutes(app: FastifyInstance) {
  // GET /api/whatsapp/status (auto-starts the caller's own client on first call)
  app.get('/api/whatsapp/status', async (req) => {
    const key = sessionKeyFor(req);
    const state = getWaState(key);
    if (state.status === 'idle') {
      // Start in background; return the transitional state immediately.
      void startWa(key);
      return { data: { ...state, status: 'starting' as const } };
    }
    return { data: state };
  });

  // POST /api/whatsapp/start — starts the caller's own WhatsApp session.
  app.post('/api/whatsapp/start', async (req) => {
    const key = sessionKeyFor(req);
    void startWa(key);
    const state = getWaState(key);
    return {
      data: { ...state, status: state.status === 'idle' ? ('starting' as const) : state.status },
    };
  });

  // POST /api/whatsapp/logout — logs the caller's own WhatsApp session out.
  app.post('/api/whatsapp/logout', async (req) => {
    const key = sessionKeyFor(req);
    const state = await logoutWa(key);
    return { data: state };
  });

  // POST /api/whatsapp/send { to, message, attachment?, cta?, userEmail? }
  app.post('/api/whatsapp/send', async (req, reply) => {
    const parsed = SendSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { to, message, attachment, cta, userEmail } = parsed.data;
    if (!message.trim() && !attachment && !cta) {
      return reply
        .code(400)
        .send({ error: 'A message, attachment, or CTA button is required.' });
    }
    // A signed-in user sends through THEIR OWN WhatsApp session; the optional
    // userEmail override (used by admins testing another account's session)
    // defaults to the caller's own session.
    const key = userEmail ? waSessionKeyFor(userEmail) : sessionKeyFor(req);
    try {
      const result = await sendWaMessage(
        to,
        message,
        attachment ? [attachment] : [],
        cta,
        key
      );
      return { data: result };
    } catch (err: any) {
      const code = err?.statusCode === 409 ? 409 : err?.statusCode === 400 ? 400 : 500;
      return reply.code(code).send({ error: err?.message ?? 'Failed to send' });
    }
  });

  // POST /api/whatsapp/internal/send — machine-to-machine bridge for the
  // payment gateway. The gateway cannot share a user session, so this route is
  // exempt from the normal auth guard and authenticates with a shared token
  // instead. It must never be exposed without WHATSAPP_BRIDGE_TOKEN set.
  app.post('/api/whatsapp/internal/send', async (req, reply) => {
    const expected = bridgeToken();
    if (!expected) {
      return reply.code(503).send({
        error:
          'WhatsApp bridge is not configured. Set WHATSAPP_BRIDGE_TOKEN on the backend.',
      });
    }

    const presented =
      (typeof req.headers['x-whatsapp-bridge-token'] === 'string'
        ? req.headers['x-whatsapp-bridge-token']
        : '') ||
      (typeof req.headers.authorization === 'string' &&
      req.headers.authorization.startsWith('Bearer ')
        ? req.headers.authorization.slice('Bearer '.length)
        : '');

    if (!presented.trim() || !secureEquals(presented.trim(), expected)) {
      return reply.code(401).send({ error: 'Invalid WhatsApp bridge token' });
    }

    const parsed = SendSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const { to, message, attachment, cta, userEmail } = parsed.data;
    if (!message.trim() && !attachment && !cta) {
      return reply
        .code(400)
        .send({ error: 'A message, attachment, or CTA button is required.' });
    }

    // System sender: the fixed super admin's own WhatsApp session.
    const key = userEmail ? waSessionKeyFor(userEmail) : waSessionKeyFor();
    try {
      const result = await sendWaMessage(
        to,
        message,
        attachment ? [attachment] : [],
        cta,
        key
      );
      return { data: result };
    } catch (err: any) {
      const code = err?.statusCode === 409 ? 409 : err?.statusCode === 400 ? 400 : 500;
      return reply.code(code).send({
        error: err?.message ?? 'WhatsApp bridge could not deliver the message',
      });
    }
  });
}
