import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getWaState, startWa, logoutWa, sendWaMessage } from '../whatsapp.js';

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
});

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
  // GET /api/whatsapp/status (auto-starts the client on first call)
  app.get('/api/whatsapp/status', async () => {
    const state = getWaState();
    if (state.status === 'idle') {
      // Start in background; return the transitional state immediately.
      void startWa();
      return { data: { ...state, status: 'starting' as const } };
    }
    return { data: state };
  });

  // POST /api/whatsapp/start
  // Fire-and-forget: Chromium takes ~25s to boot on the 512MB droplet.
  // Returning immediately lets the UI show "starting" and keep polling
  // status instead of a request hanging until the engine is up.
  app.post('/api/whatsapp/start', async () => {
    void startWa();
    const state = getWaState();
    return {
      data: { ...state, status: state.status === 'idle' ? ('starting' as const) : state.status },
    };
  });

  // POST /api/whatsapp/logout
  app.post('/api/whatsapp/logout', async () => {
    const state = await logoutWa();
    return { data: state };
  });

  // POST /api/whatsapp/send { to, message, attachment?, cta? }
  app.post('/api/whatsapp/send', async (req, reply) => {
    const parsed = SendSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { to, message, attachment, cta } = parsed.data;
    if (!message.trim() && !attachment && !cta) {
      return reply
        .code(400)
        .send({ error: 'A message, attachment, or CTA button is required.' });
    }
    try {
      const result = await sendWaMessage(
        to,
        message,
        attachment ? [attachment] : [],
        cta
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

    const { to, message, attachment, cta } = parsed.data;
    if (!message.trim() && !attachment && !cta) {
      return reply
        .code(400)
        .send({ error: 'A message, attachment, or CTA button is required.' });
    }

    try {
      const result = await sendWaMessage(
        to,
        message,
        attachment ? [attachment] : [],
        cta
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
