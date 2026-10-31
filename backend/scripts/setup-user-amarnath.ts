import '../src/env.js';

import {
  APPWRITE_COLLECTIONS,
  putRecord,
  replaceScopedRecords,
} from '../src/appwrite.js';
import { scopedEntityId } from '../src/tenant.js';
import {
  findUserByEmail,
  hashPassword,
  normalizeEmail,
  saveUser,
  type UserRecord,
} from '../src/users.js';
import { getProfile, seedProfileDefaults } from '../src/profiles.js';

const TARGET_EMAIL = normalizeEmail('testuser2412@gmail.com');
const TARGET_NAME = 'Amarnath';
const TARGET_PHONE = '6374984055';
const PROFILE_ID = 'ORG-XD3SLDDC';
const DEFAULT_PASSWORD = 'Password@123';

const DROPDOWNS: Record<string, string[]> = {
  gender: ['Male', 'Female', 'Other'],
  classGroup: ['Science Batch A', 'Class 10-A', 'Class 11-A', 'Class 12-A'],
  course: ['Science', 'Commerce', 'Arts', 'Computer Science'],
  studentStatus: ['Active', 'Inactive', 'Graduated'],
  feeFrequency: ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'],
  feeType: ['Tuition Fee', 'Admission Fee', 'Exam Fee', 'Lab Fee'],
  paymentMethod: ['UPI', 'Cash', 'Card', 'Bank Transfer'],
  receiptStatus: ['Paid', 'Pending', 'Cancelled'],
};

async function main() {
  console.log(`Setting up user and 1-user data for ${TARGET_EMAIL}...`);

  // 1. Ensure user account exists with name "Amarnath"
  let user = await findUserByEmail(TARGET_EMAIL);
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  if (user) {
    user.name = TARGET_NAME;
    user.role = 'admin';
    user.active = true;
    user.profile_id = PROFILE_ID;
    user.password_hash = passwordHash;
    user.updated_at = new Date().toISOString();
    await saveUser(user);
    console.log(`Updated user account: ${user.email} (Name: ${user.name}, ID: ${user.id})`);
  } else {
    const newUser: UserRecord = {
      id: 3,
      name: TARGET_NAME,
      email: TARGET_EMAIL,
      password_hash: passwordHash,
      role: 'admin',
      active: true,
      profile_id: PROFILE_ID,
      super: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveUser(newUser);
    console.log(`Created user account: ${newUser.email} (Name: ${newUser.name})`);
  }

  // 2. Ensure profile exists and has ownerName "Amarnath"
  let profile = await getProfile(PROFILE_ID);
  if (profile) {
    profile.name = TARGET_NAME;
    profile.ownerName = TARGET_NAME;
    profile.ownerEmail = TARGET_EMAIL;
    profile.paymentUrl = 'https://myfees.myenum.in/amarnath';
    profile.updatedAt = new Date().toISOString();
    await putRecord(APPWRITE_COLLECTIONS.profiles, PROFILE_ID, profile);
    console.log(`Updated profile: ${PROFILE_ID} (Name: ${profile.name})`);
  }

  // 3. Ensure dropdown options
  await seedProfileDefaults(PROFILE_ID);
  const dropdownItems = Object.entries(DROPDOWNS).map(([key, data]) => ({
    entityId: key,
    data,
  }));
  await replaceScopedRecords(
    APPWRITE_COLLECTIONS.dropdownOptions,
    PROFILE_ID,
    dropdownItems
  );
  console.log(`Seeded dropdown options for ${PROFILE_ID}`);

  // 4. Exactly 1 Branch
  const branch = {
    branchId: 'BR-001',
    branchName: 'Main Campus',
    code: 'MC-01',
    address: 'Main Campus Road',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    phone: TARGET_PHONE,
    email: TARGET_EMAIL,
    managerName: TARGET_NAME,
    status: 'Active',
    isHeadBranch: true,
    capacity: '100',
  };
  await replaceScopedRecords(APPWRITE_COLLECTIONS.branches, PROFILE_ID, [
    { entityId: branch.branchId, data: branch },
  ]);
  console.log(`Seeded 1 branch: ${branch.branchName}`);

  // 5. Exactly 1 Student (Name: Amarnath, Phone/WhatsApp: 6374984055)
  const student = {
    studentId: 'STU-001',
    studentName: TARGET_NAME,
    dob: '2002-05-15',
    gender: 'Male',
    guardian: 'Parent',
    phone: TARGET_PHONE,
    email: TARGET_EMAIL,
    address: 'Main Campus Road, Chennai',
    group: 'Science Batch A',
    course: 'Science',
    branch: 'Main Campus',
    joiningDate: '2026-06-01',
    status: 'Active',
  };
  await replaceScopedRecords(APPWRITE_COLLECTIONS.students, PROFILE_ID, [
    { entityId: student.studentId, data: student },
  ]);
  console.log(`Seeded 1 student: ${student.studentName} (${student.studentId}, WhatsApp: ${student.phone})`);

  // 6. Exactly 1 Student Group
  const group = {
    groupId: 'GRP-001',
    groupName: 'Science Batch A',
    course: 'Science',
    batch: '2026 Batch',
    feeAmount: '5000',
    feeFrequency: 'Monthly',
    startDate: '2026-06-01',
    endDate: '2027-05-31',
    description: 'Science academic batch with interactive WhatsApp reminder support',
    studentIds: [student.studentId],
  };
  await replaceScopedRecords(APPWRITE_COLLECTIONS.studentGroups, PROFILE_ID, [
    { entityId: group.groupId, data: group },
  ]);
  console.log(`Seeded 1 group: ${group.groupName} (${group.groupId})`);

  // 7. Exactly 1 Fee Structure
  const feeStructure = {
    structureId: 'FEE-001',
    structureName: 'Science Batch A - Tuition Fee',
    courseGroup: `${group.groupName} (${group.groupId})`,
    feeType: 'Tuition Fee',
    amount: '5000',
    frequency: 'Monthly',
    dueDate: 'Every month: 5th',
    lateFee: '200',
    paymentMethods: ['UPI', 'Cash', 'Card'],
    status: 'Active',
    description: 'Monthly tuition fee for Amarnath',
    studentIds: [student.studentId],
  };
  await replaceScopedRecords(APPWRITE_COLLECTIONS.feeStructures, PROFILE_ID, [
    { entityId: feeStructure.structureId, data: feeStructure },
  ]);
  console.log(`Seeded 1 fee structure: ${feeStructure.structureName}`);

  // 8. Exactly 1 Receipt
  const receipt = {
    receiptId: 'RCP-001',
    studentId: student.studentId,
    studentName: student.studentName,
    amount: '5000',
    method: 'UPI',
    paymentDate: '2026-10-24',
    status: 'Paid',
    notes: `Initial term fee payment for ${student.course} (${student.group}) via UPI`,
  };
  await replaceScopedRecords(APPWRITE_COLLECTIONS.receipts, PROFILE_ID, [
    { entityId: receipt.receiptId, data: receipt },
  ]);
  console.log(`Seeded 1 receipt: ${receipt.receiptId}`);

  // 9. Clean announcements
  await replaceScopedRecords(APPWRITE_COLLECTIONS.announcements, PROFILE_ID, []);

  // 10. Exactly 1 Business Profile with contact details
  const businessProfile = {
    name: TARGET_NAME,
    primaryCategory: 'Educational institution',
    additionalCategories: ['Coaching center', 'Tutoring service'],
    description: 'Premier educational coaching and fee management center.',
    openingDate: '2026-01-01',
    businessType: 'On-site',
    labels: ['Official'],
    status: 'Open',
    phone: TARGET_PHONE,
    secondaryPhone: '',
    email: TARGET_EMAIL,
    website: 'https://myfees.myenum.in/amarnath',
    whatsapp: TARGET_PHONE,
    social: {
      facebook: '',
      instagram: '',
      x: '',
      youtube: '',
      linkedin: '',
    },
    location: {
      country: 'India',
      state: 'Tamil Nadu',
      city: 'Chennai',
      postalCode: '600001',
      addressLine1: 'Main Campus Road',
      addressLine2: '',
      locality: 'Chennai Central',
      serviceArea: true,
      serviceAreas: ['Chennai'],
      serviceRadiusKm: '25',
      latitude: '13.0827',
      longitude: '80.2707',
      mapUrl: '',
      hideAddress: false,
    },
    hours: {
      timezone: 'Asia/Kolkata',
      days: {
        monday: { open: true, allDay: false, from: '09:00', to: '18:00' },
        tuesday: { open: true, allDay: false, from: '09:00', to: '18:00' },
        wednesday: { open: true, allDay: false, from: '09:00', to: '18:00' },
        thursday: { open: true, allDay: false, from: '09:00', to: '18:00' },
        friday: { open: true, allDay: false, from: '09:00', to: '18:00' },
        saturday: { open: true, allDay: false, from: '09:00', to: '18:00' },
        sunday: { open: false, allDay: false, from: '09:00', to: '18:00' },
      },
      special: [],
      note: 'Classes conducted Monday through Saturday',
    },
    attributes: {
      accessibility: ['Wheelchair accessible entrance'],
      amenities: ['Restroom', 'Wi-Fi'],
      serviceOptions: ['On-site services', 'Online classes'],
      payments: ['UPI', 'Cash', 'Credit Card', 'Debit Card'],
      parking: ['Free parking lot'],
      highlights: ['Interactive WhatsApp Reminders', 'Automated Receipts'],
    },
    media: {
      logoUrl: '',
      coverUrl: '',
      photos: [],
      videoUrl: '',
    },
    verificationStatus: 'Verified',
    verifiedOn: '2026-10-24',
    notes: 'Primary verified institutional profile for Amarnath',
  };

  await putRecord(
    APPWRITE_COLLECTIONS.businessProfiles,
    scopedEntityId(PROFILE_ID, '1'),
    {
      profile: businessProfile,
      updatedAt: new Date().toISOString(),
    }
  );
  console.log(`Seeded business profile for ${PROFILE_ID} (Phone & WhatsApp: ${TARGET_PHONE})`);

  console.log(`\nAll 1-user data setup complete for ${TARGET_EMAIL}!`);
  console.log(`Credentials:`);
  console.log(`  Email: ${TARGET_EMAIL}`);
  console.log(`  Password: ${DEFAULT_PASSWORD}`);
  console.log(`  Name: ${TARGET_NAME}`);
  console.log(`  Contact/WhatsApp: ${TARGET_PHONE}`);
}

main().catch((err) => {
  console.error('Error during setup:', err);
  process.exit(1);
});
