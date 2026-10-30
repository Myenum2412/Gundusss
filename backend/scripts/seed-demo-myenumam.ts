/**
 * Seed demo data for a specific account's workspace.
 *
 * Usage:  npx tsx scripts/seed-demo-myenumam.ts [<email>]   (default: myenumam@gmail.com)
 *
 * Safe to re-run: rows using the demo ids (STU-D01, BR-D01, ...) are skipped
 * when they already exist, and the account's own rows are never touched.
 */
import '../src/env.js';

import {
  APPWRITE_COLLECTIONS,
  getRecord,
  listScopedRecords,
  putRecord,
  replaceScopedRecords,
  type StoredRecord,
} from '../src/db.js';
import { listUsers, normalizeEmail } from '../src/users.js';
import { getProfile, seedProfileDefaults } from '../src/profiles.js';

const TARGET_EMAIL = normalizeEmail(
  process.argv[2] ?? 'myenumam@gmail.com'
);

const DEMO_TAG = '-D';
function demoId(prefix: string, n: number, size = 2): string {
  return `${prefix}${DEMO_TAG}${String(n).padStart(size, '0')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function dateBack(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Demo content (values match the seeded dropdown options)
// ---------------------------------------------------------------------------

const DEMO_DROPDOWNS: Record<string, string[]> = {
  gender: ['Male', 'Female', 'Other'],
  classGroup: [
    'Class 10-A',
    'Class 10-B',
    'Class 11-A',
    'Class 11-B',
    'Class 12-A',
    'Group A',
    'Group B',
  ],
  course: [
    'Science',
    'Commerce',
    'Arts',
    'JEE Coaching',
    'NEET Coaching',
    'Computer Basics',
  ],
  studentStatus: ['Active', 'Inactive', 'Graduated'],
  feeFrequency: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'One-Time'],
  feeType: [
    'Tuition Fee',
    'Admission Fee',
    'Exam Fee',
    'Transport Fee',
    'Library Fee',
    'Lab Fee',
    'Other',
  ],
  paymentMethod: ['Cash', 'UPI', 'Card', 'Bank Transfer'],
  receiptStatus: ['Paid', 'Pending', 'Cancelled'],
};

const BRANCHES = [
  {
    branchId: demoId('BR-', 1, 2),
    branchName: 'Main Campus - Jayanagar',
    code: 'MC-JY',
    address: '42, 11th Main Rd, 4th Block, Jayanagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560011',
    phone: '+91 98450 11201',
    email: 'jayanagar@myenumam.in',
    managerName: 'Dr. Ramesh Kumar',
    status: 'Active',
    isHeadBranch: true,
    capacity: '600',
  },
  {
    branchId: demoId('BR-', 2, 2),
    branchName: 'Koramangala Learning Center',
    code: 'KR-02',
    address: '80 Feet Rd, 5th Block, Koramangala',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560095',
    phone: '+91 98450 11202',
    email: 'koramangala@myenumam.in',
    managerName: 'Priya Nair',
    status: 'Active',
    isHeadBranch: false,
    capacity: '350',
  },
  {
    branchId: demoId('BR-', 3, 2),
    branchName: 'Whitefield Study Hub',
    code: 'WF-03',
    address: 'Somerset Greenways, ITPL Main Rd',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560066',
    phone: '+91 98450 11203',
    email: 'whitefield@myenumam.in',
    managerName: 'Arjun Menon',
    status: 'Active',
    isHeadBranch: false,
    capacity: '280',
  },
  {
    branchId: demoId('BR-', 4, 2),
    branchName: 'Indiranagar Evening Center',
    code: 'IN-04',
    address: '100 Feet Rd, HAL 2nd Stage',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    phone: '+91 98450 11204',
    email: 'indiranagar@myenumam.in',
    managerName: 'Kavya Reddy',
    status: 'Inactive',
    isHeadBranch: false,
    capacity: '150',
  },
];

type StudentRow = Partial<DemoStudent> & { joining?: number; guardian?: string; branch?: string };

interface DemoStudent {
  studentId: string;
  studentName: string;
  dob: string;
  gender: string;
  guardian: string;
  phone: string;
  email: string;
  address: string;
  group: string;
  course: string;
  branch: string;
  joiningDate: string;
  status: string;
}

const studentRows: StudentRow[] = [
  { studentName: 'Aarav Sharma', gender: 'Male', group: 'Class 10-A', course: 'Science', branch: 'Main Campus - Jayanagar', status: 'Active', dob: '2011-03-14', joining: 420, guardian: 'Vikram Sharma' },
  { studentName: 'Diya Patel', gender: 'Female', group: 'Class 10-B', course: 'Science', branch: 'Main Campus - Jayanagar', status: 'Active', dob: '2011-07-02', joining: 380, guardian: 'Nikhil Patel' },
  { studentName: 'Rohan Iyer', gender: 'Male', group: 'Class 11-A', course: 'JEE Coaching', branch: 'Koramangala Learning Center', status: 'Active', dob: '2010-01-19', joining: 340, guardian: 'Suresh Iyer' },
  { studentName: 'Meera Krishnan', gender: 'Female', group: 'Class 11-B', course: 'NEET Coaching', branch: 'Koramangala Learning Center', status: 'Active', dob: '2010-11-05', joining: 300, guardian: 'Latha Krishnan' },
  { studentName: 'Kabir Malhotra', gender: 'Male', group: 'Class 12-A', course: 'Commerce', branch: 'Whitefield Study Hub', status: 'Active', dob: '2009-05-28', joining: 260, guardian: 'Rajesh Malhotra' },
  { studentName: 'Ananya Rao', gender: 'Female', group: 'Class 12-A', course: 'Science', branch: 'Main Campus - Jayanagar', status: 'Active', dob: '2009-09-16', joining: 220, guardian: 'Deepak Rao' },
  { studentName: 'Vihaan Reddy', gender: 'Male', group: 'Group A', course: 'Computer Basics', branch: 'Whitefield Study Hub', status: 'Active', dob: '2012-02-08', joining: 180, guardian: 'Sandeep Reddy' },
  { studentName: 'Ishita Bose', gender: 'Female', group: 'Group B', course: 'Arts', branch: 'Main Campus - Jayanagar', status: 'Active', dob: '2012-06-30', joining: 140, guardian: 'Arun Bose' },
  { studentName: 'Arnav Gupta', gender: 'Male', group: 'Class 11-A', course: 'JEE Coaching', branch: 'Koramangala Learning Center', status: 'Inactive', dob: '2010-04-22', joining: 120, guardian: 'Manish Gupta' },
  { studentName: 'Saanvi Nair', gender: 'Female', group: 'Class 10-A', course: 'Science', branch: 'Whitefield Study Hub', status: 'Active', dob: '2011-08-11', joining: 80, guardian: 'Pradeep Nair' },
  { studentName: 'Dhruv Singh', gender: 'Male', group: 'Group B', course: 'Computer Basics', branch: 'Main Campus - Jayanagar', status: 'Graduated', dob: '2011-12-03', joining: 500, guardian: 'Harpreet Singh' },
  { studentName: 'Tanvi Deshmukh', gender: 'Female', group: 'Class 11-B', course: 'NEET Coaching', branch: 'Koramangala Learning Center', status: 'Active', dob: '2010-10-27', joining: 30, guardian: 'Vivek Deshmukh' },
];

const DEMO_STUDENTS: DemoStudent[] = studentRows.map((row, index) => ({
  studentId: demoId('STU-', index + 1),
  studentName: row.studentName ?? '',
  dob: row.dob ?? '',
  gender: row.gender ?? 'Other',
  guardian: `${row.guardian ?? 'Guardian'} (Parent)`,
  phone: `+91 98${String(10000000 + index * 1379173).slice(0, 8)}`,
  email: `${(row.studentName ?? 'student').toLowerCase().replace(/\s+/g, '.')}@example.com`,
  address: `${12 + index * 4}, Rose Villa, ${row.branch ?? 'Main Campus'} area, Bengaluru`,
  group: row.group ?? 'Group A',
  course: row.course ?? 'Science',
  branch: row.branch ?? 'Main Campus - Jayanagar',
  joiningDate: dateBack(row.joining ?? 30),
  status: row.status ?? 'Active',
}));

const DEMO_GROUPS = [
  {
    groupId: demoId('GRP-', 1),
    groupName: 'Science 10-A Morning',
    course: 'Science',
    batch: '2026 Batch / Class 10-A',
    feeAmount: '4500',
    feeFrequency: 'Monthly',
    startDate: '2025-06-01',
    endDate: '2026-03-31',
    description: 'Core physics, chemistry and maths coaching. 6 days a week.',
    studentIds: [DEMO_STUDENTS[0].studentId, DEMO_STUDENTS[1].studentId, DEMO_STUDENTS[9].studentId],
  },
  {
    groupId: demoId('GRP-', 2),
    groupName: 'JEE Advanced Sprint',
    course: 'JEE Coaching',
    batch: '2026 Batch / Class 11-A',
    feeAmount: '18000',
    feeFrequency: 'Quarterly',
    startDate: '2025-06-15',
    endDate: '2026-04-15',
    description: 'Intensive problem-solving sessions plus weekly mock tests.',
    studentIds: [DEMO_STUDENTS[2].studentId, DEMO_STUDENTS[8].studentId],
  },
  {
    groupId: demoId('GRP-', 3),
    groupName: 'NEET Biology Focus',
    course: 'NEET Coaching',
    batch: '2026 Batch / Class 11-B',
    feeAmount: '15000',
    feeFrequency: 'Quarterly',
    startDate: '2025-07-01',
    endDate: '2026-04-30',
    description: 'Biology-focused NEET preparation with lab dissections.',
    studentIds: [DEMO_STUDENTS[3].studentId, DEMO_STUDENTS[11].studentId],
  },
  {
    groupId: demoId('GRP-', 4),
    groupName: 'Computer Basics Weekend',
    course: 'Computer Basics',
    batch: 'Weekend / Mixed',
    feeAmount: '2500',
    feeFrequency: 'One-Time',
    startDate: '2025-09-01',
    endDate: '2025-12-31',
    description: 'Weekend classes covering MS Office, internet safety and typing.',
    studentIds: [DEMO_STUDENTS[6].studentId, DEMO_STUDENTS[10].studentId],
  },
];

const DEMO_FEE_STRUCTURES = [
  {
    structureId: demoId('FEE-', 1),
    structureName: 'Monthly Tuition - Class 10',
    courseGroup: 'Class 10-A, Class 10-B',
    feeType: 'Tuition Fee',
    amount: '4500',
    frequency: 'Monthly',
    dueDate: '5th of every month',
    lateFee: '100',
    paymentMethods: ['Cash', 'UPI'],
    status: 'Active',
    description: 'Standard monthly tuition plan for all Science class 10 groups.',
    studentIds: [DEMO_STUDENTS[0].studentId, DEMO_STUDENTS[1].studentId, DEMO_STUDENTS[9].studentId],
  },
  {
    structureId: demoId('FEE-', 2),
    structureName: 'JEE Quarterly Package',
    courseGroup: 'Class 11-A',
    feeType: 'Tuition Fee',
    amount: '18000',
    frequency: 'Quarterly',
    dueDate: 'Quarter start date',
    lateFee: '500',
    paymentMethods: ['Bank Transfer', 'Card'],
    status: 'Active',
    description: 'Covers all four JEE subjects and the weekly test series.',
    studentIds: [DEMO_STUDENTS[2].studentId, DEMO_STUDENTS[8].studentId],
  },
  {
    structureId: demoId('FEE-', 3),
    structureName: 'NEET Tuition + Lab',
    courseGroup: 'Class 11-B',
    feeType: 'Lab Fee',
    amount: '15000',
    frequency: 'Quarterly',
    dueDate: 'Quarter start date',
    lateFee: '400',
    paymentMethods: ['UPI', 'Bank Transfer'],
    status: 'Active',
    description: 'NEET tuition with lab access and printed study material.',
    studentIds: [DEMO_STUDENTS[3].studentId, DEMO_STUDENTS[11].studentId],
  },
  {
    structureId: demoId('FEE-', 4),
    structureName: 'Computer Basics One-Time',
    courseGroup: 'Group A, Group B',
    feeType: 'Admission Fee',
    amount: '2500',
    frequency: 'One-Time',
    dueDate: 'On enrolment',
    lateFee: '',
    paymentMethods: ['Cash', 'UPI'],
    status: 'Active',
    description: 'Full-course fee collected once at enrolment.',
    studentIds: [DEMO_STUDENTS[6].studentId, DEMO_STUDENTS[10].studentId],
  },
];

const receiptRows = [
  { studentIndex: 0, amount: '4500', method: 'UPI', status: 'Paid', days: 4, notes: 'June tuition' },
  { studentIndex: 1, amount: '4500', method: 'Cash', status: 'Paid', days: 4, notes: 'June tuition' },
  { studentIndex: 2, amount: '18000', method: 'Bank Transfer', status: 'Paid', days: 12, notes: 'JEE Q2 package' },
  { studentIndex: 3, amount: '15000', method: 'UPI', status: 'Pending', days: 6, notes: 'NEET Q2 - awaiting gateway confirmation' },
  { studentIndex: 4, amount: '4500', method: 'UPI', status: 'Paid', days: 2, notes: 'July tuition' },
  { studentIndex: 5, amount: '3000', method: 'Cash', status: 'Pending', days: 1, notes: 'Exam fee instalment 1' },
  { studentIndex: 6, amount: '2500', method: 'Card', status: 'Paid', days: 20, notes: 'Computer basics course fee' },
  { studentIndex: 8, amount: '4500', method: 'Cash', status: 'Cancelled', days: 28, notes: 'Duplicate receipt - cancelled by accountant' },
];

const DEMO_RECEIPTS = receiptRows.map((row, index) => ({
  receiptId: demoId('RCP-', index + 1),
  studentId: DEMO_STUDENTS[row.studentIndex].studentId,
  studentName: DEMO_STUDENTS[row.studentIndex].studentName,
  amount: row.amount,
  method: row.method,
  paymentDate: dateBack(row.days),
  status: row.status,
  notes: row.notes,
}));

const DEMO_ANNOUNCEMENTS = [
  {
    announcementId: demoId('ANN-', 1),
    title: 'Diwali break: 18th - 22nd October',
    message:
      'Dear parents, the institute will remain closed from the 18th to the 22nd for Diwali. Classes resume on the 23rd. Wishing you a festive week!',
    recipientIds: DEMO_STUDENTS.slice(0, 6).map((s) => s.studentId),
    recipientNames: DEMO_STUDENTS.slice(0, 6).map((s) => s.studentName),
    sentCount: 6,
    failedCount: 0,
    status: 'Sent',
    createdAt: nowIso(),
  },
  {
    announcementId: demoId('ANN-', 2),
    title: 'Fee reminder - October instalment',
    message:
      'This is a reminder to complete the October fee instalment by the 5th. Late payments attract a Rs. 100 fine. You can pay online via the payment link on your receipt.',
    recipientIds: [DEMO_STUDENTS[3].studentId, DEMO_STUDENTS[5].studentId],
    recipientNames: [DEMO_STUDENTS[3].studentName, DEMO_STUDENTS[5].studentName],
    sentCount: 2,
    failedCount: 0,
    status: 'Sent',
    createdAt: nowIso(),
  },
  {
    announcementId: demoId('ANN-', 3),
    title: 'Mock test results published',
    message:
      'JEE and NEET mock test scores are now published in your group. Please review your scorecard and attend the doubt-clearing session on Saturday at 10 AM.',
    recipientIds: [DEMO_STUDENTS[2].studentId, DEMO_STUDENTS[8].studentId, DEMO_STUDENTS[11].studentId],
    recipientNames: [DEMO_STUDENTS[2].studentName, DEMO_STUDENTS[8].studentName, DEMO_STUDENTS[11].studentName],
    sentCount: 2,
    failedCount: 1,
    status: 'Partial',
    createdAt: nowIso(),
  },
];

// ---------------------------------------------------------------------------
// Seeding helpers (merge, never delete the account's own rows)
// ---------------------------------------------------------------------------

async function mergeSeed<T>(
  collection: (typeof APPWRITE_COLLECTIONS)[keyof typeof APPWRITE_COLLECTIONS],
  items: Array<{ entityId: string; data: T }>,
  profileId: string,
  label: string
): Promise<number> {
  const existing = await listScopedRecords<T>(collection, profileId);
  const present = new Set(existing.map((record) => record.entityId));
  const additions = items.filter((item) => !present.has(item.entityId));
  if (additions.length === 0) {
    console.log(`  ${label}: already seeded (${existing.length} rows) - skipped`);
    return 0;
  }

  await replaceScopedRecords(
    collection,
    profileId,
    [
      ...existing,
      ...additions.map((item) => ({
        entityId: item.entityId,
        data: item.data as unknown as Record<string, unknown>,
      })),
    ]
  );
  console.log(`  ${label}: added ${additions.length} rows`);
  return additions.length;
}

async function main(): Promise<void> {
  if (process.env.APPWRITE_API_KEY?.trim() === '') {
    throw new Error('APPWRITE_API_KEY is missing in backend/.env');
  }

  console.log(`Looking up account ${TARGET_EMAIL}...`);
  const users = await listUsers();
  const user = users.find((u) => normalizeEmail(u.email) === TARGET_EMAIL);
  if (!user) {
    console.error(
      `No account found for ${TARGET_EMAIL}. Available non-admin accounts:\n` +
        users
          .filter((u) => normalizeEmail(u.email) !== 'developer@myenum.in')
          .map((u) => `  - ${u.email}`)
          .join('\n')
    );
    process.exit(1);
  }

  const profileId = (user.profile_id ?? '').trim();
  if (!profileId) {
    console.error(
      `Account ${TARGET_EMAIL} has no workspace (profile_id). Restart the backend once so it is backfilled, then retry.`
    );
    process.exit(1);
  }

  const profile = await getProfile(profileId);
  console.log(
    `Workspace: ${profileId} (${profile?.name ?? 'unknown'}), owner ${profile?.ownerEmail ?? user.name}`
  );

  await seedProfileDefaults(profileId);

  const seededDropdowns = await listScopedRecords<string[]>(
    APPWRITE_COLLECTIONS.dropdownOptions,
    profileId
  );
  const dropdownPresent = new Set(seededDropdowns.map((r) => r.entityId));
  const dropdowns: Array<{ entityId: string; data: string[] }> = [];
  for (const [key, options] of Object.entries(DEMO_DROPDOWNS)) {
    const current = seededDropdowns.find((r) => r.entityId === key)?.data ?? [];
    const mergedOptions = Array.from(new Set([...options, ...current]));
    dropdowns.push({ entityId: key, data: mergedOptions });
    dropdownPresent.delete(key);
  }
  // keep any custom keys the account created
  for (const key of dropdownPresent) {
    const record = seededDropdowns.find((r) => r.entityId === key) as
      | StoredRecord<string[]>
      | undefined;
    if (record) dropdowns.push({ entityId: key, data: record.data });
  }
  await replaceScopedRecords(
    APPWRITE_COLLECTIONS.dropdownOptions,
    profileId,
    dropdowns as Array<{ entityId: string; data: unknown }>
  );
  console.log(
    `  Dropdowns: ensured ${dropdowns.length} lists across all 8 form pages`
  );

  await mergeSeed(APPWRITE_COLLECTIONS.branches, BRANCHES.map((branch) => ({ entityId: branch.branchId, data: branch })), profileId, 'Branches');
  await mergeSeed(APPWRITE_COLLECTIONS.students, DEMO_STUDENTS.map((student) => ({ entityId: student.studentId, data: student })), profileId, 'Students');
  await mergeSeed(APPWRITE_COLLECTIONS.studentGroups, DEMO_GROUPS.map((group) => ({ entityId: group.groupId, data: group })), profileId, 'Groups');
  await mergeSeed(APPWRITE_COLLECTIONS.feeStructures, DEMO_FEE_STRUCTURES.map((structure) => ({ entityId: structure.structureId, data: structure })), profileId, 'Fee structures');
  await mergeSeed(APPWRITE_COLLECTIONS.receipts, DEMO_RECEIPTS.map((receipt) => ({ entityId: receipt.receiptId, data: receipt })), profileId, 'Receipts');
  await mergeSeed(APPWRITE_COLLECTIONS.announcements, DEMO_ANNOUNCEMENTS.map((announcement) => ({ entityId: announcement.announcementId, data: announcement })), profileId, 'Announcements');

  // Touch the profile so updatedAt signals the change
  if (profile) {
    await putRecord(APPWRITE_COLLECTIONS.profiles, profileId, {
      ...profile,
      updatedAt: nowIso(),
    });
  }

  console.log(`\nDone. Demo data ready for ${TARGET_EMAIL} (${profileId}).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
