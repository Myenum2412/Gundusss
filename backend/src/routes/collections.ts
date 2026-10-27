import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  APPWRITE_COLLECTIONS,
  getRecord,
  listRecords,
  listScopedRecords,
  replaceScopedRecords,
} from '../appwrite.js';
import { getProfile, resolveProfileId } from '../profiles.js';
import { scopedEntityId } from '../tenant.js';
import { sendWaMessage } from '../whatsapp.js';
import { generateReceiptPdf, type ReceiptPdfData } from '../receipt-pdf.js';

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
  branch: str(100),
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

type Student = z.infer<typeof StudentSchema>;
type Group = z.infer<typeof GroupSchema>;
type FeeStructure = z.infer<typeof FeeStructureSchema>;
type Receipt = z.infer<typeof ReceiptSchema>;
type Announcement = z.infer<typeof AnnouncementSchema>;
type Branch = z.infer<typeof BranchSchema>;

async function listData<T>(
  collection: (typeof APPWRITE_COLLECTIONS)[keyof typeof APPWRITE_COLLECTIONS],
  sortKey: (value: T) => string,
  profileId: string
): Promise<T[]> {
  const records = await listScopedRecords<T>(collection, profileId);
  return records
    .map((record) => record.data)
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export async function buildReceiptPdfData(
  profileId: string,
  receipt: any
): Promise<ReceiptPdfData> {
  // 1. Student details lookup
  let studentData: any = {};
  if (receipt.studentId) {
    const stuRec = await getRecord<any>(
      APPWRITE_COLLECTIONS.students,
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
        APPWRITE_COLLECTIONS.students,
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
      APPWRITE_COLLECTIONS.businessProfiles,
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
      };
    }
  } catch {
    // Non-blocking
  }

  // 2b. Branches lookup (campus / branch specific details)
  try {
    const branches = await listScopedRecords<any>(
      APPWRITE_COLLECTIONS.branches,
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
      APPWRITE_COLLECTIONS.paymentSettings,
      scopedEntityId(profileId, '1')
    );
    if (paySetRec?.data?.upi_id) {
      orgData.upiId = paySetRec.data.upi_id;
    }
  } catch {
    // Non-blocking
  }

  // 3. Extract transaction details (orderId, utr, payerVpa) from receipt fields or notes
  let orderId = receipt.orderId || '';
  let utr = receipt.utr || '';
  let payerVpa = receipt.payerVpa || receipt.upiId || '';

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
    const match = notesStr.match(/UPI:\s*([^\s·,]+)/i);
    if (match) payerVpa = match[1];
  }

  // If orderId found, see if we can look up order for more info
  if (orderId && (!utr || !payerVpa || !studentData.studentName)) {
    try {
      const orderRec = await getRecord<any>(
        APPWRITE_COLLECTIONS.paymentOrders,
        scopedEntityId(profileId, orderId)
      );
      if (orderRec?.data) {
        utr = utr || orderRec.data.utr;
        payerVpa = payerVpa || orderRec.data.payerVpa || orderRec.data.upiId;
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
    },
  };
}

export async function collectionsRoutes(app: FastifyInstance) {
  // ---- Students ----
  app.get('/api/students', async (req) => {
    const profileId = await resolveProfileId(req);
    return {
      data: await listData<Student>(
        APPWRITE_COLLECTIONS.students,
        (student) => student.studentId,
        profileId
      ),
    };
  });

  app.put('/api/students', async (req, reply) => {
    const parsed = itemsSchema(StudentSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const profileId = await resolveProfileId(req);
    await replaceScopedRecords(
      APPWRITE_COLLECTIONS.students,
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
        APPWRITE_COLLECTIONS.studentGroups,
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
      APPWRITE_COLLECTIONS.studentGroups,
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
        APPWRITE_COLLECTIONS.feeStructures,
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
      APPWRITE_COLLECTIONS.feeStructures,
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
    return {
      data: await listData<Receipt>(
        APPWRITE_COLLECTIONS.receipts,
        (receipt) => receipt.receiptId,
        profileId
      ),
    };
  });

  app.put('/api/receipts', async (req, reply) => {
    const parsed = itemsSchema(ReceiptSchema).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const profileId = await resolveProfileId(req);
    await replaceScopedRecords(
      APPWRITE_COLLECTIONS.receipts,
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
      APPWRITE_COLLECTIONS.receipts,
      scopedEntityId(profileId, receiptId)
    );
    if (record?.data) {
      receipt = record.data;
    } else {
      // Fallback: search receipts in profile by receiptId or entityId
      const allReceipts = await listScopedRecords<Receipt>(
        APPWRITE_COLLECTIONS.receipts,
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
    const allReceipts = await listRecords<Receipt>(APPWRITE_COLLECTIONS.receipts);
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
      APPWRITE_COLLECTIONS.receipts,
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
      const waResult = await sendWaMessage(
        cleanPhone,
        messageText,
        [
          {
            name: `Receipt_${receipt.receiptId}.pdf`,
            mime: 'application/pdf',
            data: pdfBase64,
          },
        ]
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
        APPWRITE_COLLECTIONS.announcements,
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
      APPWRITE_COLLECTIONS.announcements,
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
      APPWRITE_COLLECTIONS.dropdownOptions,
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
      APPWRITE_COLLECTIONS.dropdownOptions,
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
        APPWRITE_COLLECTIONS.branches,
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
      APPWRITE_COLLECTIONS.branches,
      profileId,
      parsed.data.items.map((branch) => ({
        entityId: branch.branchId,
        data: branch,
      }))
    );
    return { data: { count: parsed.data.items.length } };
  });
}
