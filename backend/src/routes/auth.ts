import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { APPWRITE_COLLECTIONS, getRecord } from '../appwrite.js';
import { LoginSchema } from '../schemas.js';

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post('/api/auth/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const record = await getRecord<UserRow>(
      APPWRITE_COLLECTIONS.users,
      normalizedEmail
    );
    if (!record) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const user = record.data;
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    return { data: { id: user.id, email: user.email } };
  });
}
