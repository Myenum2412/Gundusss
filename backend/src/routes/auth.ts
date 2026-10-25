import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { createToken, ROLE_PERMISSIONS, verifyToken } from '../auth.js';
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
  getAuthUser,
  normalizeEmail,
  toPublicUser,
  verifyPassword,
  type PublicUser,
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

  // GET /api/auth/gate — nginx auth_request target for the gateway-admin panel.
  // Public (no session required to reach it), but validates the fees session
  // token that nginx forwards from whichever client source provided it:
  //   X-Fees-Header: the request's own Authorization header (API calls)
  //   X-Fees-Cookie: the fees_session cookie (same-origin navigation)
  //   X-Fees-Arg:    ?fees_token= query param (iframe src built by the dashboard)
  // Returns 200 only for a valid, active account; anything else is 401.
  app.get('/api/auth/gate', async (req, reply) => {
    req.log.info(
      {
        h: Object.fromEntries(
          Object.entries(req.headers)
            .filter(([k]) => k.startsWith('x-fees-'))
            .map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 24) : v])
        ),
      },
      'gate-headers'
    );
    const sources = [
      String(req.headers['x-fees-header'] || ''),
      String(req.headers['x-fees-cookie'] || ''),
      // nginx auth subrequests do not inherit ?args=; the main location
      // stashes the fees token into a variable (set $gate_arg_token) which
      // subrequests DO see — see the nginx gate config.
      String(req.headers['x-fees-set'] || ''),
      String(req.headers['x-fees-arg'] || ''),
    ];
    for (const source of sources) {
      const token = source.replace(/^Bearer\s+/i, '').trim();
      const payload = verifyToken(token);
      if (!payload) continue;
      let user: PublicUser | null = null;
      try {
        user = await getAuthUser(payload.email);
      } catch {
        return reply
          .code(503)
          .send({ error: 'Could not verify the session. Try again.' });
      }
      // A signed token that no longer matches an active account is rejected
      // outright — fall through to 401 rather than trying other sources.
      if (user && user.active) return reply.code(200).send({ ok: true });
      break;
    }
    return reply.code(401).send({
      error: 'Open the Gateway Admin from the dashboard to continue.',
    });
  });

  // POST /api/auth/logout — tokens are stateless, so the client simply drops
  // its copy. Kept as an endpoint so logout is explicit and auditable.
  app.post('/api/auth/logout', async () => ({ data: { ok: true } }));
}
