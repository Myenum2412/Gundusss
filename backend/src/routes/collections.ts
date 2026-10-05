import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';

const str = (max = 500) => z.string().max(max).default('');
const strArray = z.array(z.string().max(200)).default([]);

const StudentSchema = z.object({
  studentId: z.string().min(1).max(30),
  studentName: z.string().min(1).max(200),
  dob: str(20),
  gender: str(20),
  guardian: str(200),
  phone: str(30),
  email: str(255),
  address: str(500),
  group: str(100),
  course: str(100),
  joiningDate: str(20),
  status: str(20),
});

const GroupSchema = z.object({
  groupId: z.string().min(1).max(30),
  groupName: z.string().min(1).max(200),
  course: str(100),
  batch: str(100),
  feeAmount: str(30),
  feeFrequency: str(30),
  startDate: str(20),
  endDate: str(20),
  description: str(1000),
  studentIds: strArray,
});

const FeeStructureSchema = z.object({
  structureId: z.string().min(1).max(30),
  structureName: z.string().min(1).max(200),
  courseGroup: str(200),
  feeType: str(100),
  amount: str(30),
  frequency: str(30),
  dueDate: str(100),
  lateFee: str(30),
  paymentMethods: strArray,
  status: str(20),
  description: str(1000),
  studentIds: strArray,
});

const ReceiptSchema = z.object({
  receiptId: z.string().min(1).max(30),
  studentId: str(30),
  studentName: str(200),
  amount: str(30),
  method: str(50),
  paymentDate: str(20),
  status: str(30),
  notes: str(1000),
});

const AnnouncementSchema = z.object({
  announcementId: z.string().min(1).max(30),
  title: str(200),
  message: str(2000),
  recipientIds: strArray,
  recipientNames: strArray,
  sentCount: z.number().int().min(0).default(0),
  failedCount: z.number().int().min(0).default(0),
  status: z.enum(['Sent', 'Partial', 'Failed']).default('Sent'),
  createdAt: z.string().max(40).default(''),
});

const DropdownsSchema = z.object({
  dropdowns: z.record(z.string(), z.array(z.string().max(200))),
});

function itemsSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item).max(10000) });
}

// Full-replace a table inside a transaction (matches the frontend's
// whole-collection save pattern).
async function replaceAll(table: string, columns: string[], rows: any[][]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ${table}`);
    if (rows.length > 0) {
      const values: any[] = [];
      const placeholders = rows.map((row, r) => {
        const cells = row.map((v, c) => {
          values.push(v);
          return `$${r * row.length + c + 1}`;
        });
        return `(${cells.join(', ')})`;
      });
      await client.query(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`,
        values
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function collectionsRoutes(app: FastifyInstance) {
  // ---- Students ----
  app.get('/api/students', async () => {
    const { rows } = await pool.query(
      `SELECT student_id AS "studentId", student_name AS "studentName", dob, gender,
              guardian, phone, email, address, class_group AS "group", course,
              joining_date AS "joiningDate", status
       FROM students ORDER BY student_id`
    );
    return { data: rows };
  });

  app.put('/api/students', async (req, reply) => {
    const parsed = itemsSchema(StudentSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    await replaceAll(
      'students',
      ['student_id', 'student_name', 'dob', 'gender', 'guardian', 'phone', 'email', 'address', 'class_group', 'course', 'joining_date', 'status'],
      parsed.data.items.map((s) => [s.studentId, s.studentName, s.dob, s.gender, s.guardian, s.phone, s.email, s.address, s.group, s.course, s.joiningDate, s.status])
    );
    return { data: { count: parsed.data.items.length } };
  });

  // ---- Student groups ----
  app.get('/api/student-groups', async () => {
    const { rows } = await pool.query(
      `SELECT group_id AS "groupId", group_name AS "groupName", course, batch,
              fee_amount AS "feeAmount", fee_frequency AS "feeFrequency",
              start_date AS "startDate", end_date AS "endDate", description,
              COALESCE(student_ids, '{}') AS "studentIds"
       FROM student_groups ORDER BY group_id`
    );
    return { data: rows };
  });

  app.put('/api/student-groups', async (req, reply) => {
    const parsed = itemsSchema(GroupSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    await replaceAll(
      'student_groups',
      ['group_id', 'group_name', 'course', 'batch', 'fee_amount', 'fee_frequency', 'start_date', 'end_date', 'description', 'student_ids'],
      parsed.data.items.map((g) => [g.groupId, g.groupName, g.course, g.batch, g.feeAmount, g.feeFrequency, g.startDate, g.endDate, g.description, g.studentIds])
    );
    return { data: { count: parsed.data.items.length } };
  });

  // ---- Fee structures ----
  app.get('/api/fee-structures', async () => {
    const { rows } = await pool.query(
      `SELECT structure_id AS "structureId", structure_name AS "structureName",
              course_group AS "courseGroup", fee_type AS "feeType", amount, frequency,
              due_date AS "dueDate", late_fee AS "lateFee",
              COALESCE(payment_methods, '{}') AS "paymentMethods", status, description,
              COALESCE(student_ids, '{}') AS "studentIds"
       FROM fee_structures ORDER BY structure_id`
    );
    return { data: rows };
  });

  app.put('/api/fee-structures', async (req, reply) => {
    const parsed = itemsSchema(FeeStructureSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    await replaceAll(
      'fee_structures',
      ['structure_id', 'structure_name', 'course_group', 'fee_type', 'amount', 'frequency', 'due_date', 'late_fee', 'payment_methods', 'status', 'description', 'student_ids'],
      parsed.data.items.map((s) => [s.structureId, s.structureName, s.courseGroup, s.feeType, s.amount, s.frequency, s.dueDate, s.lateFee, s.paymentMethods, s.status, s.description, s.studentIds])
    );
    return { data: { count: parsed.data.items.length } };
  });

  // ---- Receipts ----
  app.get('/api/receipts', async () => {
    const { rows } = await pool.query(
      `SELECT receipt_id AS "receiptId", student_id AS "studentId",
              student_name AS "studentName", amount, method,
              payment_date AS "paymentDate", status, notes
       FROM receipts ORDER BY receipt_id`
    );
    return { data: rows };
  });

  app.put('/api/receipts', async (req, reply) => {
    const parsed = itemsSchema(ReceiptSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    await replaceAll(
      'receipts',
      ['receipt_id', 'student_id', 'student_name', 'amount', 'method', 'payment_date', 'status', 'notes'],
      parsed.data.items.map((r) => [r.receiptId, r.studentId, r.studentName, r.amount, r.method, r.paymentDate, r.status, r.notes])
    );
    return { data: { count: parsed.data.items.length } };
  });

  // ---- Announcements ----
  app.get('/api/announcements', async () => {
    const { rows } = await pool.query(
      `SELECT announcement_id AS "announcementId", title, message,
              COALESCE(recipient_ids, '{}') AS "recipientIds",
              COALESCE(recipient_names, '{}') AS "recipientNames",
              sent_count AS "sentCount", failed_count AS "failedCount",
              status, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
       FROM announcements ORDER BY announcement_id`
    );
    return { data: rows };
  });

  app.put('/api/announcements', async (req, reply) => {
    const parsed = itemsSchema(AnnouncementSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    await replaceAll(
      'announcements',
      ['announcement_id', 'title', 'message', 'recipient_ids', 'recipient_names', 'sent_count', 'failed_count', 'status', 'created_at'],
      parsed.data.items.map((a) => [
        a.announcementId, a.title, a.message, a.recipientIds, a.recipientNames,
        a.sentCount, a.failedCount, a.status,
        a.createdAt || new Date().toISOString(),
      ])
    );
    return { data: { count: parsed.data.items.length } };
  });

  // ---- Dropdown options ----
  app.get('/api/dropdowns', async () => {
    const { rows } = await pool.query<{ list_key: string; options: string[] }>(
      'SELECT list_key, COALESCE(options, \'{}\') AS options FROM dropdown_options'
    );
    const map: Record<string, string[]> = {};
    for (const r of rows) map[r.list_key] = r.options ?? [];
    return { data: map };
  });

  app.put('/api/dropdowns', async (req, reply) => {
    const parsed = DropdownsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, options] of Object.entries(parsed.data.dropdowns)) {
        await client.query(
          `INSERT INTO dropdown_options (list_key, options) VALUES ($1, $2)
           ON CONFLICT (list_key) DO UPDATE SET options = EXCLUDED.options`,
          [key, options]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return { data: { count: Object.keys(parsed.data.dropdowns).length } };
  });
}
