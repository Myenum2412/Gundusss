import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getWaState, startWa, logoutWa, sendWaMessage } from '../whatsapp.js';

const SendSchema = z.object({
  to: z.string().min(10).max(20),
  message: z.string().min(1).max(2000),
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
  app.post('/api/whatsapp/start', async () => {
    const state = await startWa();
    return { data: state };
  });

  // POST /api/whatsapp/logout
  app.post('/api/whatsapp/logout', async () => {
    const state = await logoutWa();
    return { data: state };
  });

  // POST /api/whatsapp/send { to, message }
  app.post('/api/whatsapp/send', async (req, reply) => {
    const parsed = SendSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    try {
      const result = await sendWaMessage(
        parsed.data.to,
        parsed.data.message
      );
      return { data: result };
    } catch (err: any) {
      const code = err?.statusCode === 409 ? 409 : err?.statusCode === 400 ? 400 : 500;
      return reply.code(code).send({ error: err?.message ?? 'Failed to send' });
    }
  });
}
