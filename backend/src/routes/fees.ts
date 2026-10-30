import type { FastifyInstance } from 'fastify';
import {
  APPWRITE_COLLECTIONS,
  deleteRecord,
  getRecord,
  listScopedRecords,
  putRecord,
} from '../db.js';
import { resolveProfileId } from '../profiles.js';
import { CreateFeeSchema, UpdateFeeSchema, type Fee } from '../schemas.js';
import { scopedEntityId } from '../tenant.js';
import {
  generateNextMonthBillsRoute,
  markOverdueFees,
  withFeeCreateLock as withCreateLock,
} from '../billing.js';

const COLLECTION = APPWRITE_COLLECTIONS.fees;

export async function feeRoutes(app: FastifyInstance) {
  // GET /api/fees — lazily sweep past-due pending bills to `overdue` first so
  // the dashboard always reflects reality without waiting for a cron job.
  app.get('/api/fees', async (req) => {
    const profileId = await resolveProfileId(req);
    await markOverdueFees(profileId);
    const records = await listScopedRecords<Fee>(COLLECTION, profileId);
    const rows = records
      .map((record) => record.data)
      .sort((a, b) => Number(b.id) - Number(a.id));
    return { data: rows };
  });

  // GET /api/fees/:id
  app.get('/api/fees/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const profileId = await resolveProfileId(req);
    const record = await getRecord<Fee>(
      COLLECTION,
      scopedEntityId(profileId, String(Number(id)))
    );
    if (!record) return reply.code(404).send({ error: 'Fee not found' });
    return { data: record.data };
  });

  // POST /api/fees
  app.post('/api/fees', async (req, reply) => {
    const parsed = CreateFeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const profileId = await resolveProfileId(req);
    const { student_name, amount, status, due_date } = parsed.data;
    const fee = await withCreateLock(async () => {
      const records = await listScopedRecords<Fee>(COLLECTION, profileId);
      const nextId =
        records.reduce(
          (max, record) => Math.max(max, Number(record.data.id) || 0),
          0
        ) + 1;
      const created: Fee = {
        id: nextId,
        student_name,
        amount: amount.toFixed(2),
        status,
        due_date,
        created_at: new Date().toISOString(),
      };
      await putRecord(
        COLLECTION,
        scopedEntityId(profileId, String(nextId)),
        created
      );
      return created;
    });
    return reply.code(201).send({ data: fee });
  });

  // PUT /api/fees/:id
  app.put('/api/fees/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateFeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const profileId = await resolveProfileId(req);
    const entityId = scopedEntityId(profileId, String(Number(id)));
    const record = await getRecord<Fee>(COLLECTION, entityId);
    if (!record) return reply.code(404).send({ error: 'Fee not found' });

    const updated: Fee = {
      ...record.data,
      ...parsed.data,
      ...(parsed.data.amount !== undefined
        ? { amount: parsed.data.amount.toFixed(2) }
        : {}),
      id: record.data.id,
      created_at: record.data.created_at,
    };
    await putRecord(COLLECTION, entityId, updated);
    return { data: updated };
  });

  // DELETE /api/fees/:id
  app.delete('/api/fees/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const profileId = await resolveProfileId(req);
    const entityId = scopedEntityId(profileId, String(Number(id)));
    const record = await getRecord<Fee>(COLLECTION, entityId);
    if (!record) return reply.code(404).send({ error: 'Fee not found' });
    await deleteRecord(COLLECTION, entityId);
    return { success: true };
  });

  // POST /api/fees/generate-next-month — auto-generate the next month's
  // pending bills for every student whose latest bill is settled.
  await generateNextMonthBillsRoute(app);
}
