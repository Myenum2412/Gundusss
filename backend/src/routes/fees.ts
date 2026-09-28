import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';
import { CreateFeeSchema, UpdateFeeSchema, type Fee } from '../schemas.js';

export async function feeRoutes(app: FastifyInstance) {
  // GET /api/fees
  app.get('/api/fees', async () => {
    const rows = await query<Fee>(
      'SELECT id, student_name, amount, status, to_char(due_date, \'YYYY-MM-DD\') as due_date, created_at FROM fees ORDER BY id DESC'
    );
    return { data: rows };
  });

  // GET /api/fees/:id
  app.get('/api/fees/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await query<Fee>(
      'SELECT id, student_name, amount, status, to_char(due_date, \'YYYY-MM-DD\') as due_date, created_at FROM fees WHERE id = $1',
      [Number(id)]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Fee not found' });
    return { data: rows[0] };
  });

  // POST /api/fees
  app.post('/api/fees', async (req, reply) => {
    const parsed = CreateFeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { student_name, amount, status, due_date } = parsed.data;
    const rows = await query<Fee>(
      `INSERT INTO fees (student_name, amount, status, due_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id, student_name, amount, status, to_char(due_date, 'YYYY-MM-DD') as due_date, created_at`,
      [student_name, amount, status, due_date]
    );
    return reply.code(201).send({ data: rows[0] });
  });

  // PUT /api/fees/:id
  app.put('/api/fees/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateFeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(parsed.data)) {
      fields.push(`${k} = $${i++}`);
      values.push(v);
    }
    if (fields.length === 0) return reply.code(400).send({ error: 'No fields to update' });
    values.push(Number(id));
    const rows = await query<Fee>(
      `UPDATE fees SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, student_name, amount, status, to_char(due_date, 'YYYY-MM-DD') as due_date, created_at`,
      values
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Fee not found' });
    return { data: rows[0] };
  });

  // DELETE /api/fees/:id
  app.delete('/api/fees/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await query('DELETE FROM fees WHERE id = $1 RETURNING id', [Number(id)]);
    if (rows.length === 0) return reply.code(404).send({ error: 'Fee not found' });
    return { success: true };
  });
}
