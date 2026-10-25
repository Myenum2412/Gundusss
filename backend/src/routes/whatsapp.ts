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

const SendSchema = z.object({
  to: z.string().min(10).max(20),
  // Empty message is allowed when the request carries a file instead.
  message: z.string().max(4000),
  attachment: AttachmentSchema.optional(),
});

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

  // POST /api/whatsapp/send { to, message, attachment? }
  app.post('/api/whatsapp/send', async (req, reply) => {
    const parsed = SendSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { to, message, attachment } = parsed.data;
    if (!message.trim() && !attachment) {
      return reply
        .code(400)
        .send({ error: 'A message or an attachment is required.' });
    }
    try {
      const result = await sendWaMessage(
        to,
        message,
        attachment ? [attachment] : []
      );
      return { data: result };
    } catch (err: any) {
      const code = err?.statusCode === 409 ? 409 : err?.statusCode === 400 ? 400 : 500;
      return reply.code(code).send({ error: err?.message ?? 'Failed to send' });
    }
  });
}
