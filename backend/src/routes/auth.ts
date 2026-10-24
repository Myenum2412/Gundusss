import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createToken, ROLE_PERMISSIONS } from '../auth.js';
import {
  createWorkspace,
  getProfileOrDefault,
  getSessionProfiles,
} from '../profiles.js';
import { LoginSchema } from '../schemas.js';
import { SUPER_PROFILE_ID } from '../tenant.js';
import {
  countUsers,
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

const SignupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  organization: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

function statusOf(err: unknown, fallback = 500): number {
  return typeof (err as { statusCode?: unknown }).statusCode === 'number'
    ? (err as { statusCode: number }).statusCode
    : fallback;
}

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
      const { user, profile } = await createWorkspace({
        name,
        organization: `${name}'s workspace`,
        email,
        password,
      });
      const publicUser = toPublicUser(user);
      return reply.code(201).send({
        data: {
          token: createToken(publicUser),
          user: publicUser,
          permissions: ROLE_PERMISSIONS[publicUser.role],
          profile,
          activeProfile: profile,
        },
      });
    } catch (err) {
      return reply
        .code(statusOf(err))
        .send({ error: err instanceof Error ? err.message : 'Setup failed' });
    }
  });

  // POST /api/auth/signup — public. Creates a brand new isolated workspace and
  // an administrator account for it.
  app.post('/api/auth/signup', async (req, reply) => {
    const parsed = SignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    try {
      const { user, profile } = await createWorkspace(parsed.data);
      const publicUser = toPublicUser(user);
      return reply.code(201).send({
        data: {
          token: createToken(publicUser),
          user: publicUser,
          permissions: ROLE_PERMISSIONS[publicUser.role],
          profile,
          activeProfile: profile,
        },
      });
    } catch (err) {
      return reply
        .code(statusOf(err, 400))
        .send({ error: err instanceof Error ? err.message : 'Signup failed' });
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

    const profile = await getProfileOrDefault(
      publicUser.profile_id || SUPER_PROFILE_ID,
      publicUser.email
    );

    return {
      data: {
        token: createToken(publicUser),
        user: publicUser,
        permissions: ROLE_PERMISSIONS[publicUser.role],
        profile,
        activeProfile: profile,
      },
    };
  });

  // GET /api/auth/me — requires a valid session (enforced by the global guard).
  app.get('/api/auth/me', async (req, reply) => {
    if (!req.auth) {
      return reply.code(401).send({ error: 'Authentication required.' });
    }
    const { profile, activeProfile } = await getSessionProfiles(req);
    return {
      data: {
        user: req.auth,
        permissions: ROLE_PERMISSIONS[req.auth.role],
        profile,
        activeProfile,
      },
    };
  });

  // POST /api/auth/logout — tokens are stateless, so the client simply drops
  // its copy. Kept as an endpoint so logout is explicit and auditable.
  app.post('/api/auth/logout', async () => ({ data: { ok: true } }));
}
