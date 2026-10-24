import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  getAuthUser,
  normalizeEmail,
  type PublicUser,
  type Role,
} from './users.js';

// ---------------------------------------------------------------------------
// Roles and permissions
// ---------------------------------------------------------------------------

export type Permission =
  | 'data:read'
  | 'data:write'
  | 'settings:manage'
  | 'users:manage'
  | 'whatsapp:manage';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'data:read',
    'data:write',
    'settings:manage',
    'users:manage',
    'whatsapp:manage',
  ],
  accountant: [
    'data:read',
    'data:write',
    'settings:manage',
    'whatsapp:manage',
  ],
  viewer: ['data:read'],
};

export function roleHasPermission(
  role: Role | undefined,
  permission: Permission
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// ---------------------------------------------------------------------------
// Stateless session tokens (HMAC-SHA256, no session table required)
// ---------------------------------------------------------------------------

interface TokenPayload {
  sub: number;
  email: string;
  role: Role;
  iat: number;
  exp: number;
}

const TOKEN_VERSION = 'v1';

const SECRET = (
  process.env.AUTH_SECRET?.trim() ||
  process.env.APPWRITE_API_KEY?.trim() ||
  ''
).trim();

const TOKEN_TTL_HOURS = Math.max(
  1,
  Number(process.env.AUTH_TOKEN_TTL_HOURS ?? 12) || 12
);
export const TOKEN_TTL_SECONDS = TOKEN_TTL_HOURS * 60 * 60;

if (!SECRET) {
  console.warn(
    '[auth] AUTH_SECRET is not set and APPWRITE_API_KEY is missing; session tokens cannot be signed.'
  );
} else if (!process.env.AUTH_SECRET?.trim()) {
  console.warn(
    '[auth] AUTH_SECRET is not set; falling back to APPWRITE_API_KEY to sign sessions. Set AUTH_SECRET in production.'
  );
}

function sign(body: string): string {
  return createHmac('sha256', SECRET)
    .update(`${TOKEN_VERSION}.${body}`)
    .digest('base64url');
}

export function createToken(user: {
  id: number;
  email: string;
  role: Role;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    sub: Number(user.id) || 0,
    email: normalizeEmail(user.email),
    role: user.role,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${TOKEN_VERSION}.${body}.${sign(body)}`;
}

export function verifyToken(token: string | null | undefined): TokenPayload | null {
  if (!token || !SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
  const [, body, signature] = parts;

  const expected = Buffer.from(sign(body));
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as TokenPayload;
    if (!payload?.email || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 <= Date.now()) return null;
    return {
      ...payload,
      email: normalizeEmail(payload.email),
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function readBearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || null;
  }
  const alt = req.headers['x-auth-token'];
  if (typeof alt === 'string' && alt.trim()) return alt.trim();
  return null;
}

// ---------------------------------------------------------------------------
// Route guard
// ---------------------------------------------------------------------------

/** Normalize a request path: strip the query string and trailing slashes. */
function requestPath(req: FastifyRequest): string {
  const raw = (req.url ?? '').split('?')[0] || '/';
  const trimmed = raw.replace(/\/+$/, '');
  return trimmed || '/';
}

function isPublicRoute(method: string, path: string): boolean {
  if (method === 'OPTIONS') return true;
  if (path === '/api/health') return true;
  if (path === '/api/auth/login' && method === 'POST') return true;
  if (path === '/api/auth/signup' && method === 'POST') return true;
  if (path === '/api/auth/setup') return true;
  if (path === '/api/auth/logout') return true;
  // The payment gateway authenticates with an HMAC signature, not a user token.
  if (path === '/api/payments/webhook') return true;
  return false;
}

export function requiredPermission(method: string, path: string): Permission {
  if (path === '/api/users' || path.startsWith('/api/users/')) {
    return 'users:manage';
  }
  if (path === '/api/business-profile') {
    return method === 'GET' || method === 'HEAD'
      ? 'data:read'
      : 'settings:manage';
  }
  if (
    path === '/api/payments/settings' ||
    path.startsWith('/api/payments/settings/')
  ) {
    return method === 'GET' || method === 'HEAD'
      ? 'data:read'
      : 'settings:manage';
  }
  if (path === '/api/whatsapp' || path.startsWith('/api/whatsapp/')) {
    return method === 'GET' || method === 'HEAD'
      ? 'data:read'
      : 'whatsapp:manage';
  }
  return method === 'GET' || method === 'HEAD' ? 'data:read' : 'data:write';
}

/**
 * Fastify onRequest hook. Authenticates every non-public API request, confirms
 * the account still exists and is enabled, then checks the role permission for
 * the HTTP method + route.
 */
export async function authGuard(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const path = requestPath(req);
  const method = req.method.toUpperCase();

  if (!path.startsWith('/api/') || isPublicRoute(method, path)) return;

  const token = readBearerToken(req);
  const payload = verifyToken(token);
  if (!payload) {
    reply.code(401).send({
      error: 'Authentication required. Sign in to continue.',
      code: 'unauthenticated',
    });
    return;
  }

  let user: PublicUser | null = null;
  try {
    user = await getAuthUser(payload.email);
  } catch (err) {
    req.log.error({ err }, 'Failed to load authenticated user');
    reply.code(503).send({
      error: 'Could not verify your account. Please try again.',
      code: 'auth_unavailable',
    });
    return;
  }

  if (!user) {
    reply.code(401).send({
      error: 'Your account no longer exists. Sign in again.',
      code: 'unauthenticated',
    });
    return;
  }
  if (!user.active) {
    reply.code(403).send({
      error: 'This account has been disabled. Contact an administrator.',
      code: 'account_disabled',
    });
    return;
  }

  const permission = requiredPermission(method, path);
  if (!roleHasPermission(user.role, permission)) {
    reply.code(403).send({
      error:
        user.role === 'viewer'
          ? 'Your account is read-only. Ask an administrator for access.'
          : 'You do not have permission to perform this action.',
      code: 'forbidden',
    });
    return;
  }

  // The organization console is reserved for the fixed developer account.
  if (
    (path === '/api/profiles' || path.startsWith('/api/profiles/')) &&
    user.super !== true
  ) {
    reply.code(403).send({
      error: 'You do not have access to the organization console.',
      code: 'forbidden',
    });
    return;
  }

  req.auth = user;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: PublicUser;
  }
}
