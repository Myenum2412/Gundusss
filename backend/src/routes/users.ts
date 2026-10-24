import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  findUserByEmail,
  findUserById,
  hashPassword,
  invalidateUserCache,
  listUsers,
  normalizeEmail,
  removeUser,
  saveUser,
  toPublicUser,
  createUser,
  type Role,
} from '../users.js';

const RoleSchema = z.enum(['admin', 'accountant', 'viewer']);

const CreateUserSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  role: RoleSchema,
});

const UpdateUserSchema = z.object({
  name: z.string().trim().max(120).optional(),
  role: RoleSchema.optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
});

function statusOf(err: unknown, fallback = 500): number {
  return typeof (err as { statusCode?: unknown }).statusCode === 'number'
    ? (err as { statusCode: number }).statusCode
    : fallback;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** True when removing admin rights from `target` would leave no active admin. */
async function isLastActiveAdmin(targetEmail: string): Promise<boolean> {
  const users = await listUsers();
  const activeAdmins = users.filter(
    (user) =>
      user.role === 'admin' &&
      user.active !== false &&
      normalizeEmail(user.email) !== normalizeEmail(targetEmail)
  );
  const target = users.find(
    (user) => normalizeEmail(user.email) === normalizeEmail(targetEmail)
  );
  return Boolean(target && target.role === 'admin' && activeAdmins.length === 0);
}

export async function userRoutes(app: FastifyInstance) {
  // The global auth guard already requires `users:manage` (admin) for /api/users.

  // GET /api/users
  app.get('/api/users', async () => {
    const users = await listUsers();
    return { data: users.map(toPublicUser) };
  });

  // POST /api/users
  app.post('/api/users', async (req, reply) => {
    const parsed = CreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    try {
      const user = await createUser(parsed.data);
      return reply.code(201).send({ data: toPublicUser(user) });
    } catch (err) {
      return reply
        .code(statusOf(err, 400))
        .send({ error: errorMessage(err, 'Could not create the user.') });
    }
  });

  // PUT /api/users/:id
  app.put<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    const parsed = UpdateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: 'Invalid user id.' });
    }

    const user = await findUserById(id);
    if (!user) {
      return reply.code(404).send({ error: 'User not found.' });
    }

    const isSelf = normalizeEmail(user.email) === req.auth?.email;
    const nextRole: Role = parsed.data.role ?? user.role ?? 'viewer';
    const nextActive = parsed.data.active ?? user.active !== false;

    if (isSelf && (nextRole !== 'admin' || !nextActive)) {
      return reply.code(400).send({
        error: 'You cannot remove your own admin access or disable yourself.',
      });
    }

    const losesAdmin =
      user.role === 'admin' && (nextRole !== 'admin' || !nextActive);
    if (losesAdmin && (await isLastActiveAdmin(user.email))) {
      return reply.code(400).send({
        error: 'At least one active administrator is required.',
      });
    }

    const updated = {
      ...user,
      name: parsed.data.name !== undefined ? parsed.data.name : user.name,
      role: nextRole,
      active: nextActive,
      password_hash: parsed.data.password
        ? await hashPassword(parsed.data.password)
        : user.password_hash,
      updated_at: new Date().toISOString(),
    };

    try {
      await saveUser(updated);
      invalidateUserCache(user.email);
      return { data: toPublicUser(updated) };
    } catch (err) {
      return reply
        .code(statusOf(err, 500))
        .send({ error: errorMessage(err, 'Could not update the user.') });
    }
  });

  // DELETE /api/users/:id
  app.delete<{ Params: { id: string } }>('/api/users/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: 'Invalid user id.' });
    }

    const user = await findUserById(id);
    if (!user) {
      return reply.code(404).send({ error: 'User not found.' });
    }

    if (normalizeEmail(user.email) === req.auth?.email) {
      return reply
        .code(400)
        .send({ error: 'You cannot delete your own account.' });
    }

    if (user.role === 'admin' && (await isLastActiveAdmin(user.email))) {
      return reply
        .code(400)
        .send({ error: 'At least one active administrator is required.' });
    }

    try {
      await removeUser(user.email);
      invalidateUserCache(user.email);
      return { data: { ok: true } };
    } catch (err) {
      return reply
        .code(statusOf(err, 500))
        .send({ error: errorMessage(err, 'Could not delete the user.') });
    }
  });

  // Small helper used by the frontend when it needs to validate an email
  // before creating an account (admin-only, same guard).
  app.get<{ Querystring: { email?: string } }>(
    '/api/users/lookup',
    async (req, reply) => {
      const email = req.query.email?.trim();
      if (!email) return reply.code(400).send({ error: 'Email is required.' });
      const user = await findUserByEmail(email);
      return {
        data: user ? { exists: true, email: normalizeEmail(user.email) } : { exists: false },
      };
    }
  );
}
