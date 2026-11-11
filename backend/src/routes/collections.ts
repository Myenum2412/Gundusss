import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DB_TABLES,
  getRecord,
  listRecords,
  listScopedRecords,
  putRecord,
  replaceScopedRecords,
} from '../db.js';
import { getProfile, resolveProfileId } from '../profiles.js';
import { scopedEntityId } from '../tenant.js';
import {
  getWaState,
  hasWaCredentials,
  sendWaMessage,
  startWa,
  waSessionKeyFor,
} from '../whatsapp.js';
import { generateReceiptPdf, type ReceiptPdfData } from '../receipt-pdf.js';

const str = (max = 500) => z.string().max(max).default('');
const strArray = z.array(z.string().max(200)).default([]);

export const StudentSchema = z.object({
  studentId: z.string().min(1).max(50),
  studentName: z.string().min(1).max(200),
  dob: str(50),
  gender: str(50),
  guardian: str(200),
  phone: str(50),
  email: str(255),
  address: str(500),
  group: str(100),
  course: str(100),
  branch: z
    .string({ required_error: 'Branch is required' })
    .trim()
    .min(1, 'Branch is required. A student cannot be created without a branch.')
    .max(100),
  joiningDate: str(50),
  status: str(50),
}).passthrough();

const GroupSchema = z.object({
  groupId: z.string().min(1).max(50),
  groupName: z.string().min(1).max(200),
  course: str(100),
  batch: str(100),
  feeAmount: str(50),
  feeFrequency: str(50),
  startDate: str(50),
  endDate: str(50),
  description: str(1000),
  studentIds: strArray,
}).passthrough();

const FeeStructureSchema = z.object({
  structureId: z.string().min(1).max(50),
  structureName: z.string().min(1).max(200),
  courseGroup: str(200),
  feeType: str(100),
  amount: str(50),
  frequency: str(50),
  dueDate: str(100),
  lateFee: str(50),
  paymentMethods: strArray,
  status: str(50),
  description: str(1000),
  studentIds: strArray,
}).passthrough();

const ReceiptSchema = z.object({
  receiptId: z.string().min(1).max(50),
  studentId: str(50),
  studentName: str(200),
  amount: str(50),
  method: str(50),
  paymentDate: str(50),
  status: str(50),
  notes: str(2000),
  utr: str(100).optional(),
  payerVpa: str(100).optional(),
  bankName: str(100).optional(),
  orderId: str(100).optional(),
  institutionName: str(200).optional(),
}).passthrough();

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

const BranchSchema = z.object({
  branchId: z.string().min(1).max(30),
  branchName: z.string().min(1).max(200),
  code: str(50),
  address: str(500),
  city: str(100),
  state: str(100),
  pincode: str(20),
  phone: str(30),
  email: str(255),
  managerName: str(200),
  status: str(20).default("Active"),
  isHeadBranch: z.boolean().default(false),
  capacity: str(20).default(""),
});

const AttendanceEntrySchema = z.object({
  studentId: z.string().min(1).max(30),
  studentName: str(200),
  group: str(100),
  status: z.enum(['Present', 'Absent', 'Late']),
  note: str(500),
});

const AttendanceDaySchema = z.object({
  date: z.string().min(1).max(20),
  entries: z.array(AttendanceEntrySchema).max(5000).default([]),
  updatedAt: str(40),
});

type Student = z.infer<typeof StudentSchema>;
type Group = z.infer<typeof GroupSchema>;
type FeeStructure = z.infer<typeof FeeStructureSchema>;
type Receipt = z.infer<typeof ReceiptSchema>;
type Announcement = z.infer<typeof AnnouncementSchema>;
type Branch = z.infer<typeof BranchSchema>;
type AttendanceEntry = z.infer<typeof AttendanceEntrySchema>;
type AttendanceDay = z.infer<typeof AttendanceDaySchema>;

async function listData<T>(
  collection: (typeof DB_TABLES)[keyof typeof DB_TABLES],
  sortKey: (value: T) => string,
  profileId: string
): Promise<T[]> {
  const records = await listScopedRecords<T>(collection, profileId);
  return records
    .map((record) => record.data)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

type AttendanceAbsence = { date: string; entry: AttendanceEntry };

const ATTENDANCE_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatAttendanceDate(value: string): string {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day || month < 1 || month > 12) return value;
  return `${String(day).padStart(2, '0')} ${ATTENDANCE_MONTHS[month - 1]} ${year}`;
}

// Attendance saves replace the whole day. Serialize the read/replace cycle per
// workspace so two tabs cannot both see the old status and send duplicate
// absence notices.
const attendanceWriteQueues = new Map<string, Promise<unknown>>();

function withAttendanceWriteLock<T>(
  profileId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = attendanceWriteQueues.get(profileId) ?? Promise.resolve();
  const run = previous.then(task, task);
  const guard = run.then(
    () => undefined,
    () => undefined
  );
  attendanceWriteQueues.set(profileId, guard);
  void guard.finally(() => {
    if (attendanceWriteQueues.get(profileId) === guard) {
      attendanceWriteQueues.delete(profileId);
    }
  });
  return run;
}

async function ensureWhatsAppReady(sessionKey: string, timeoutMs = 15_000) {
  let state = getWaState(sessionKey);
  if (state.status === 'ready') return state;
  // Never generate a QR loop for an account that has not paired yet.
  if (!hasWaCredentials(sessionKey)) return state;
  if (
    state.status === 'idle' ||
    state.status === 'disconnected' ||
    state.status === 'error'
  ) {
    void startWa(sessionKey);
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    state = getWaState(sessionKey);
    if (state.status === 'ready' || state.status === 'qr') return state;
  }
  return state;
}

async function notifyAttendanceAbsences(
  app: FastifyInstance,
  profileId: string,
  absences: AttendanceAbsence[]
): Promise<void> {
  if (absences.length === 0) return;

  // Let a quick correction (Absent -> Present) land before messaging a parent,
  // so an accidental tap does not send a notice.
  await new Promise((resolve) => setTimeout(resolve, 2_000));

  const latestRows = await listScopedRecords<AttendanceDay>(
    DB_TABLES.attendance,
    profileId
  );
  const latestByDate = new Map(
    latestRows.map((row) => [row.data.date, row.data])
  );
  const stillAbsent = absences.filter(({ date, entry }) => {
    const latest = latestByDate.get(date);
    return latest?.entries.some(
      (row) => row.studentId === entry.studentId && row.status === 'Absent'
    );
  });
  if (stillAbsent.length === 0) return;

  const profile = await getProfile(profileId);
  const waKey = waSessionKeyFor(profile?.ownerEmail ?? '');
  const wa = await ensureWhatsAppReady(waKey);
  if (wa.status !== 'ready') {
    app.log.warn(
      { profileId, status: wa.status, count: stillAbsent.length },
      'Attendance absence WhatsApp notices skipped: session not ready'
    );
    return;
  }

  const studentRows = await listScopedRecords<Student>(
    DB_TABLES.students,
    profileId
  );
  const studentsById = new Map(
    studentRows.map((row) => [row.data.studentId, row.data])
  );
  const schoolName = (profile?.name ?? '').trim() || 'School';

  for (const { date, entry } of stillAbsent) {
    const student = studentsById.get(entry.studentId);
    const phone = (student?.phone ?? '').replace(/\D/g, '');
    if (phone.length < 10) {
      app.log.warn(
        { profileId, studentId: entry.studentId },
        'Attendance absence WhatsApp notice skipped: no phone number'
      );
      continue;
    }

    const name =
      (entry.studentName || student?.studentName || 'your child').trim();
    const message = [
      '*Attendance Notice*',
      '',
      'Dear Parent/Guardian,',
      '',
      `This is to inform you that *${name}* was marked *Absent* on *${formatAttendanceDate(date)}*.`,
      '',
      'If this is unexpected, please contact us.',
      '',
      `- ${schoolName}`,
    ].join('\n');

    try {
      await sendWaMessage(phone, message, [], undefined, waKey);
    } catch (error) {
      app.log.warn(
        { err: error, profileId, studentId: entry.studentId },
        'Could not send attendance absence WhatsApp notice'
      );
    }
  }
}

export async function buildReceiptPdfData(
  profileId: string,
  receipt: any
): Promise<ReceiptPdfData> {
  // 1. Student details lookup
  let studentData: any = {};
  if (receipt.studentId) {
    const stuRec = await getRecord<any>(
      DB_TABLES.students,
      scopedEntityId(profileId, receipt.studentId)
    );
    if (stuRec?.data) {
      studentData = stuRec.data;
    }
  }

  // Fallback: If student details missing, try searching by studentName
  if (!studentData.studentName && receipt.studentName) {
    try {
      const allStudents = await listScopedRecords<any>(
        DB_TABLES.students,
        profileId
      );
      const matched = allStudents.find(
        (s) =>
          s.data?.studentName?.trim().toLowerCase() ===
          receipt.studentName?.trim().toLowerCase()
      );
      if (matched?.data) {
        studentData = matched.data;
      }
    } catch {
      // Non-blocking
    }
  }

  // 2. Organization / Institution Profile Details lookup
  let orgData: any = {};

  // 2a. Business Profile (primary information: name, category, contact, address)
  try {
    const bizRec = await getRecord<any>(
      DB_TABLES.businessProfiles,
      scopedEntityId(profileId, '1')
    );
    if (bizRec?.data?.profile) {
      const bp = bizRec.data.profile;
      orgData = {
        name: bp.name,
        tagline: bp.primaryCategory || bp.description,
        email: bp.email,
        phone: bp.phone,
        website: bp.website,
        address: bp.location?.addressLine1,
        city: bp.location?.city,
        state: bp.location?.state,
        pincode: bp.location?.postalCode || bp.location?.pincode,
        logoUrl: bp.media?.logoUrl || '',
      };
    }
  } catch {
    // Non-blocking
  }

  // 2b. Branches lookup (campus / branch specific details)
  try {
    const branches = await listScopedRecords<any>(
      DB_TABLES.branches,
      profileId
    );
    if (branches.length > 0) {
      const stuBranch = (studentData.branch || '').trim().toLowerCase();
      const branchMatch =
        branches.find(
          (b) => stuBranch && b.data?.branchName?.toLowerCase() === stuBranch
        ) ||
        branches.find((b) => b.data?.isHeadBranch) ||
        branches[0];

      if (branchMatch?.data) {
        const bd = branchMatch.data;
        orgData.branchName = orgData.branchName || bd.branchName;
        orgData.address = orgData.address || bd.address;
        orgData.city = orgData.city || bd.city;
        orgData.state = orgData.state || bd.state;
        orgData.pincode = orgData.pincode || bd.pincode;
        orgData.phone = orgData.phone || bd.phone;
        orgData.email = orgData.email || bd.email;
        if (bd.managerName) {
          orgData.authorizedSignatory = bd.managerName;
        }
      }
    }
  } catch {
    // Non-blocking
  }

  // 2c. Base Profile info (ownerName, paymentUrl, ownerEmail)
  try {
    const prof = await getProfile(profileId);
    if (prof) {
      orgData.name = orgData.name || prof.name || 'MyFees Learning Center';
      orgData.email = orgData.email || prof.ownerEmail;
      orgData.website = orgData.website || prof.paymentUrl;
      orgData.authorizedSignatory =
        orgData.authorizedSignatory || prof.ownerName || 'Accounts Officer';
    }
  } catch {
    // Non-blocking
  }

  // 2d. Payment Settings (Merchant UPI ID)
  try {
    const paySetRec = await getRecord<any>(
      DB_TABLES.paymentSettings,
      scopedEntityId(profileId, '1')
    );
    if (paySetRec?.data?.upi_id) {
      orgData.upiId = paySetRec.data.upi_id;
    }
  } catch {
    // Non-blocking
  }

  // 3. Extract transaction details (orderId, utr, payerVpa, bankName) from receipt fields or notes
  let orderId = receipt.orderId || '';
  let utr = receipt.utr || '';
  let payerVpa = receipt.payerVpa || receipt.upiId || '';
  let bankName = receipt.bankName || '';

  const notesStr = String(receipt.notes || '');
  if (!orderId) {
    const match = notesStr.match(/Order:\s*([A-Za-z0-9_-]+)/i);
    if (match) orderId = match[1];
  }
  if (!utr) {
    const match = notesStr.match(/UTR:\s*([A-Za-z0-9_-]+)/i);
    if (match) utr = match[1];
  }
  if (!payerVpa) {
    const match = notesStr.match(/UPI:\s*([^\s·,]+)/i) || notesStr.match(/Payer:\s*([^\s·,]+)/i);
    if (match) payerVpa = match[1];
  }
  if (!bankName) {
    const match = notesStr.match(/Bank:\s*([^\s·,]+(?:\s+[^\s·,]+)?)/i);
    if (match) bankName = match[1];
  }

  // If orderId found, see if we can look up order for more info
  if (orderId && (!utr || !payerVpa || !bankName || !studentData.studentName)) {
    try {
      const orderRec = await getRecord<any>(
        DB_TABLES.paymentOrders,
        scopedEntityId(profileId, orderId)
      );
      if (orderRec?.data) {
        utr = utr || orderRec.data.utr;
        payerVpa = payerVpa || orderRec.data.payerVpa || orderRec.data.upiId;
        bankName = bankName || orderRec.data.bankName;
        if (!studentData.studentName && orderRec.data.studentName) {
          studentData.studentName = orderRec.data.studentName;
        }
      }
    } catch {
      // Non-blocking
    }
  }

  return {
    receiptId: receipt.receiptId,
    paymentDate: receipt.paymentDate,
    amount: receipt.amount,
    method: receipt.method || 'Cash',
    status: receipt.status || 'Paid',
    notes: receipt.notes,
    orderId: orderId || undefined,
    utr: utr || undefined,
    payerVpa: payerVpa || undefined,
    bankName: bankName || undefined,
    student: {
      studentId: receipt.studentId || studentData.studentId || '—',
      studentName: receipt.studentName || studentData.studentName || 'Student',
      phone: studentData.phone || '',
      email: studentData.email || '',
      course: studentData.course || '',
      group: studentData.group || '',
      branch: studentData.branch || '',
      guardian: studentData.guardian || '',
      address: studentData.address || '',
      gender: studentData.gender || '',
    },
    organization: {
      name: orgData.name || 'Educational Institution',
      tagline: orgData.tagline || '',
      branchName: orgData.branchName || '',
      email: orgData.email || '',
      phone: orgData.phone || '',
      website: orgData.website || '',
      address: orgData.address || '',
      city: orgData.city || '',
      state: orgData.state || '',
      pincode: orgData.pincode || '',
      upiId: orgData.upiId || '',
      authorizedSignatory: orgData.authorizedSignatory || 'Accounts Officer',
      logoUrl: orgData.logoUrl || '',
    },
  };
}

export async function collectionsRoutes(app: FastifyInstance) {
  // ---- Students ----
  app.get('/api/students', async (req) => {
    const profileId = await resolveProfileId(req);
    return {
      data: await listData<Student>(
        DB_TABLES.students,
        (student) => student.studentId,
        profileId
      ),
    };
  });

  app.put('/api/students', async (req, reply) => {
    const parsed = itemsSchema(StudentSchema).safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const errorMsg = issue?.message || 'Invalid body';
      return reply.code(400).send({
        error: errorMsg,
        details: parsed.error.flatten(),
      });
    }
    const profileId = await resolveProfileId(req);
    await replaceScopedRecords(
      DB_TABLES.students,
      profileId,
      parsed.data.items.map((student) => ({
        entityId: student.studentId,
        data: student,
      }))
    );
    return { data: { count: parsed.data.items.length } };
  });

  // ---- Student groups ----
  app.get('/api/student-groups', async (req) => {
    const profileId = await resolveProfileId(req);
    return {
      data: await listData<Group>(
        DB_TABLES.studentGroups,
        (group) => group.groupId,
        profileId
      ),
    };
  });

  app.put('/api/student-groups', async (req, reply) => {
    const parsed = itemsSchema(GroupSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const profileId = await resolveProfileId(req);
    await replaceScopedRecords(
      DB_TABLES.studentGroups,
      profileId,
      parsed.data.items.map((group) => ({
        entityId: group.groupId,
        data: group,
      }))
    );
    return { data: { count: parsed.data.items.length } };
  });

  // ---- Fee structures ----
  app.get('/api/fee-structures', async (req) => {
    const profileId = await resolveProfileId(req);
    return {
      data: await listData<FeeStructure>(
        DB_TABLES.feeStructures,
        (structure) => structure.structureId,
        profileId
      ),
    };
  });

  app.put('/api/fee-structures', async (req, reply) => {
    const parsed = itemsSchema(FeeStructureSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const profileId = await resolveProfileId(req);
    await replaceScopedRecords(
      DB_TABLES.feeStructures,
      profileId,
      parsed.data.items.map((structure) => ({
        entityId: structure.structureId,
        data: structure,
      }))
    );
    return { data: { count: parsed.data.items.length } };
  });

  // ---- Receipts ----
  app.get('/api/receipts', async (req) => {
    const profileId = await resolveProfileId(req);
    const storedReceipts = await listData<Receipt>(
      DB_TABLES.receipts,
      (receipt) => receipt.receiptId,
      profileId
    );

    try {
      const orders = await listScopedRecords<any>(DB_TABLES.paymentOrders, profileId);
      if (profileId === 'ORG-WVL98PEB') {
        const orgmenuOrders = await listScopedRecords<any>(DB_TABLES.paymentOrders, 'orgmenu');
        orders.push(...orgmenuOrders);
        const orgmenuReceipts = await listScopedRecords<Receipt>(DB_TABLES.receipts, 'orgmenu');
        for (const omr of orgmenuReceipts) {
          if (!storedReceipts.some((r) => r.receiptId === omr.data.receiptId)) {
            storedReceipts.push(omr.data);
          }
        }
      }

      const receiptMap = new Map<string, Receipt>();
      for (const r of storedReceipts) {
        receiptMap.set(r.receiptId, r);
      }

      for (const ord of orders) {
        const o = ord.data;
        if (!o) continue;
        const isSuccess = o.status === 'SUCCESS' || o.status === 'PAID' || !!o.receiptId;
        if (!isSuccess) continue;
        const rId = o.receiptId || (o.orderId ? `RCP-${o.orderId.replace(/\D/g, '').slice(-3) || '001'}` : '');
        if (!rId) continue;

        if (!receiptMap.has(rId)) {
          const newReceipt: Receipt = {
            receiptId: rId,
            studentId: o.studentId || '',
            studentName: o.studentName || 'Student',
            amount: String(o.amount || '0'),
            method: o.method || 'UPI',
            paymentDate: (o.completedAt || o.createdAt || new Date().toISOString()).split('T')[0],
            status: 'Paid',
            notes: o.notes || `Order ${o.orderId || ''}`,
            utr: o.utr,
            payerVpa: o.payerVpa,
            bankName: o.bankName,
            orderId: o.orderId,
            institutionName: o.institutionName,
          };
          receiptMap.set(rId, newReceipt);
          try {
            await putRecord(
              DB_TABLES.receipts,
              scopedEntityId(profileId, rId),
              newReceipt
            );
          } catch {}
        }
      }

      return {
        data: Array.from(receiptMap.values()).sort((a, b) => {
          const numA = parseInt(a.receiptId.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.receiptId.replace(/\D/g, ''), 10) || 0;
          return numB - numA;
        }),
      };
    } catch {
      return { data: storedReceipts };
    }
  });

  app.put('/api/receipts', async (req, reply) => {
    const parsed = itemsSchema(ReceiptSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const profileId = await resolveProfileId(req);
    await replaceScopedRecords(
      DB_TABLES.receipts,
      profileId,
      parsed.data.items.map((receipt) => ({
        entityId: receipt.receiptId,
        data: receipt,
      }))
    );
    return { data: { count: parsed.data.items.length } };
  });

  // GET /api/receipts/:receiptId/pdf — download or view receipt as PDF (authenticated)
  app.get('/api/receipts/:receiptId/pdf', async (req, reply) => {
    const { receiptId } = req.params as { receiptId: string };
    const profileId = await resolveProfileId(req);

    let receipt: any = null;
    const record = await getRecord<Receipt>(
      DB_TABLES.receipts,
      scopedEntityId(profileId, receiptId)
    );
    if (record?.data) {
      receipt = record.data;
    } else {
      // Fallback: search receipts in profile by receiptId or entityId
      const allReceipts = await listScopedRecords<Receipt>(
        DB_TABLES.receipts,
        profileId
      );
      const match = allReceipts.find(
        (r) =>
          r.data.receiptId.toLowerCase() === receiptId.toLowerCase() ||
          r.entityId.endsWith(`__${receiptId}`)
      );
      if (match?.data) {
        receipt = match.data;
      }
    }

    if (!receipt) {
      return reply.code(404).send({ error: 'Receipt not found' });
    }

    const pdfData = await buildReceiptPdfData(profileId, receipt);
    const pdfBuffer = await generateReceiptPdf(pdfData);

    return reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `inline; filename="Receipt-${receiptId}.pdf"`
      )
      .send(pdfBuffer);
  });

  // GET /api/public/receipts/:receiptId/pdf — public receipt download without login
  app.get('/api/public/receipts/:receiptId/pdf', async (req, reply) => {
    const { receiptId } = req.params as { receiptId: string };
    const allReceipts = await listRecords<Receipt>(DB_TABLES.receipts);
    const match = allReceipts.find(
      (r) =>
        r.data.receiptId.toLowerCase() === receiptId.toLowerCase() ||
        r.entityId.endsWith(`__${receiptId}`) ||
        String(r.data.notes || '').includes(receiptId)
    );

    if (!match?.data) {
      return reply.code(404).send({ error: 'Receipt not found' });
    }

    const profileId = match.entityId.includes('__')
      ? match.entityId.split('__')[0]
      : 'ORG-KRG73BEG';

    const pdfData = await buildReceiptPdfData(profileId, match.data);
    const pdfBuffer = await generateReceiptPdf(pdfData);

    return reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `inline; filename="Receipt-${receiptId}.pdf"`
      )
      .send(pdfBuffer);
  });

  // POST /api/receipts/:receiptId/send-pdf — send receipt PDF via WhatsApp
  app.post('/api/receipts/:receiptId/send-pdf', async (req, reply) => {
    const { receiptId } = req.params as { receiptId: string };
    const profileId = await resolveProfileId(req);

    const record = await getRecord<Receipt>(
      DB_TABLES.receipts,
      scopedEntityId(profileId, receiptId)
    );
    if (!record?.data) {
      return reply.code(404).send({ error: 'Receipt not found' });
    }

    const receipt = record.data;
    const pdfData = await buildReceiptPdfData(profileId, receipt);

    const recipientPhone = (req.body as any)?.phone || pdfData.student.phone;
    if (!recipientPhone) {
      return reply.code(400).send({
        error:
          'No phone number available for this student. Please add a phone number first.',
      });
    }

    const cleanPhone = String(recipientPhone).replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return reply.code(400).send({
        error: `Invalid recipient phone number: ${recipientPhone}`,
      });
    }

    const pdfBuffer = await generateReceiptPdf(pdfData);
    const pdfBase64 = pdfBuffer.toString('base64');

    const messageText = `🎉 *Payment Receipt #${receipt.receiptId}*\n\nDear ${pdfData.student.studentName},\n\nThank you for your payment! Please find your official payment receipt PDF attached for your records.\n\n• *Receipt ID:* ${receipt.receiptId}\n• *Amount:* ₹${receipt.amount}\n• *Method:* ${receipt.method || 'Cash / UPI'}\n• *Date:* ${receipt.paymentDate || '—'}\n• *Status:* Confirmed (Paid)\n\n— ${pdfData.organization.name || 'Accounts Desk'}`;

    try {
      // Sent through the signed-in user's OWN isolated WhatsApp session.
      const waKey = waSessionKeyFor(req.auth?.email);
      const waResult = await sendWaMessage(
        cleanPhone,
        messageText,
        [
          {
            name: `Receipt_${receipt.receiptId}.pdf`,
            mime: 'application/pdf',
            data: pdfBase64,
          },
        ],
        undefined,
        waKey
      );
      return { ok: true, sentTo: cleanPhone, messageId: waResult.id };
    } catch (err: any) {
      return reply.code(500).send({
        error: `Failed to send WhatsApp message: ${err?.message || String(err)}`,
      });
    }
  });

  // ---- Announcements ----
  app.get('/api/announcements', async (req) => {
    const profileId = await resolveProfileId(req);
    return {
      data: await listData<Announcement>(
        DB_TABLES.announcements,
        (announcement) => announcement.announcementId,
        profileId
      ),
    };
  });

  app.put('/api/announcements', async (req, reply) => {
    const parsed = itemsSchema(AnnouncementSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const profileId = await resolveProfileId(req);
    await replaceScopedRecords(
      DB_TABLES.announcements,
      profileId,
      parsed.data.items.map((announcement) => ({
        entityId: announcement.announcementId,
        data: {
          ...announcement,
          createdAt: announcement.createdAt || new Date().toISOString(),
        },
      }))
    );
    return { data: { count: parsed.data.items.length } };
  });

  // ---- Dropdown options ----
  app.get('/api/dropdowns', async (req) => {
    const profileId = await resolveProfileId(req);
    const records = await listScopedRecords<string[]>(
      DB_TABLES.dropdownOptions,
      profileId
    );
    const map: Record<string, string[]> = {};
    for (const record of records) {
      map[record.entityId] = Array.isArray(record.data) ? record.data : [];
    }
    return { data: map };
  });

  app.put('/api/dropdowns', async (req, reply) => {
    const parsed = DropdownsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const profileId = await resolveProfileId(req);
    await replaceScopedRecords(
      DB_TABLES.dropdownOptions,
      profileId,
      Object.entries(parsed.data.dropdowns).map(([key, options]) => ({
        entityId: key,
        data: options,
      }))
    );
    return { data: { count: Object.keys(parsed.data.dropdowns).length } };
  });

  // ---- Branches ----
  app.get('/api/branches', async (req) => {
    const profileId = await resolveProfileId(req);
    return {
      data: await listData<Branch>(
        DB_TABLES.branches,
        (branch) => branch.branchId,
        profileId
      ),
    };
  });

  app.put('/api/branches', async (req, reply) => {
    const parsed = itemsSchema(BranchSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const profileId = await resolveProfileId(req);
    await replaceScopedRecords(
      DB_TABLES.branches,
      profileId,
      parsed.data.items.map((branch) => ({
        entityId: branch.branchId,
        data: branch,
      }))
    );
    return { data: { count: parsed.data.items.length } };
  });

  // ---- Attendance (one row per calendar day) ----
  app.get('/api/attendance', async (req) => {
    const profileId = await resolveProfileId(req);
    return {
      data: await listData<AttendanceDay>(
        DB_TABLES.attendance,
        (day) => day.date,
        profileId
      ),
    };
  });

  app.put('/api/attendance', async (req, reply) => {
    const parsed = itemsSchema(AttendanceDaySchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const profileId = await resolveProfileId(req);

    const result = await withAttendanceWriteLock(profileId, async () => {
      const previousRows = await listScopedRecords<AttendanceDay>(
        DB_TABLES.attendance,
        profileId
      );
      const previousByDate = new Map(
        previousRows.map((row) => [row.data.date, row.data])
      );

      const absences: AttendanceAbsence[] = [];
      const seen = new Set<string>();
      for (const day of parsed.data.items) {
        const previousStatuses = new Map(
          (previousByDate.get(day.date)?.entries ?? []).map((entry) => [
            entry.studentId,
            entry.status,
          ])
        );
        for (const entry of day.entries) {
          if (entry.status !== 'Absent') continue;
          if (previousStatuses.get(entry.studentId) === 'Absent') continue;
          const key = `${day.date}:${entry.studentId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          absences.push({ date: day.date, entry });
        }
      }

      await replaceScopedRecords(
        DB_TABLES.attendance,
        profileId,
        parsed.data.items.map((day) => ({
          entityId: day.date,
          data: {
            ...day,
            updatedAt: day.updatedAt || new Date().toISOString(),
          },
        }))
      );

      return { count: parsed.data.items.length, absences };
    });

    if (result.absences.length > 0) {
      void notifyAttendanceAbsences(app, profileId, result.absences).catch(
        (error) => {
          app.log.warn(
            { err: error, profileId },
            'Attendance absence notification failed'
          );
        }
      );
    }

    return { data: { count: result.count } };
  });
}
