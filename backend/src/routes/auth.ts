import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createToken, ROLE_PERMISSIONS } from '../auth.js';
import { LoginSchema } from '../schemas.js';
import {
  countUsers,
  createUser,
  findUserByEmail,
  normalizeEmail,
  toPublicUser,
  verifyPassword,
} from '../users.js';

const SetupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

export async function authRoutes(app: FastifyInstance) {
  // GET /api/auth/setup — public. Tells the login screen whether the very first
  // administrator still needs to be created.
  app.get('/api/auth/setup', async () => ({
    data: { needsSetup: (await countUsers()) === 0 },
  }));

  // POST /api/auth/setup — public, but only works while no users exist.
  app.post('/api/auth/setup', async (req, reply) => {
    const parsed = SetupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    if ((await countUsers()) > 0) {
      return reply.code(409).send({
        error:
          'Setup has already been completed. Sign in with an existing account.',
      });
    }

    const { name, email, password } = parsed.data;
    try {
      const user = await createUser({
        name,
        email,
        password,
        role: 'admin',
      });
      const publicUser = toPublicUser(user);
      return reply.code(201).send({
        data: {
          token: createToken(publicUser),
          user: publicUser,
          permissions: ROLE_PERMISSIONS[publicUser.role],
        },
      });
    } catch (err) {
      const status =
        typeof (err as { statusCode?: unknown }).statusCode === 'number'
          ? (err as { statusCode: number }).statusCode
          : 500;
      return reply
        .code(status)
        .send({ error: err instanceof Error ? err.message : 'Setup failed' });
    }
  });

  // POST /api/auth/login — public.
  app.post('/api/auth/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;

    const user = await findUserByEmail(normalizeEmail(email));
    if (!user) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const publicUser = toPublicUser(user);
    if (!publicUser.active) {
      return reply.code(403).send({
        error: 'This account has been disabled. Contact an administrator.',
      });
    }

    return {
      data: {
        token: createToken(publicUser),
        user: publicUser,
        permissions: ROLE_PERMISSIONS[publicUser.role],
      },
    };
  });

  // GET /api/auth/me — requires a valid session (enforced by the global guard).
  app.get('/api/auth/me', async (req, reply) => {
    if (!req.auth) {
      return reply.code(401).send({ error: 'Authentication required.' });
    }
    return {
      data: {
        user: req.auth,
        permissions: ROLE_PERMISSIONS[req.auth.role],
      },
    };
  });

  // POST /api/auth/logout — tokens are stateless, so the client simply drops
  // its copy. Kept as an endpoint so logout is explicit and auditable.
  app.post('/api/auth/logout', async () => ({ data: { ok: true } }));
}
