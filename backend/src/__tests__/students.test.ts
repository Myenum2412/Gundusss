import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudentSchema, FeeStructureSchema } from '../routes/collections.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('Student Branch Requirement Enforcement', () => {
  const baseStudent = {
    studentId: 'STU-001',
    studentName: 'Test Student',
    dob: '2005-01-01',
    gender: 'Male',
    guardian: 'Guardian Name',
    phone: '9876543210',
    email: 'student@example.com',
    address: '123 Main St',
    group: 'Class 10',
    course: 'General',
    joiningDate: '2026-01-01',
    status: 'Active',
  };

  it('rejects student creation when branch is missing', () => {
    const result = StudentSchema.safeParse({ ...baseStudent });
    assert.strictEqual(result.success, false);
    if (!result.success) {
      const branchIssue = result.error.issues.find((i) => i.path.includes('branch'));
      assert.ok(branchIssue, 'Should have a validation issue on branch');
    }
  });

  it('rejects student creation when branch is empty string', () => {
    const result = StudentSchema.safeParse({ ...baseStudent, branch: '' });
    assert.strictEqual(result.success, false);
    if (!result.success) {
      const branchIssue = result.error.issues.find((i) => i.path.includes('branch'));
      assert.ok(branchIssue, 'Should have a validation issue on branch');
      assert.strictEqual(
        branchIssue.message,
        'Branch is required. A student cannot be created without a branch.'
      );
    }
  });

  it('rejects student creation when branch is whitespace only', () => {
    const result = StudentSchema.safeParse({ ...baseStudent, branch: '   ' });
    assert.strictEqual(result.success, false);
    if (!result.success) {
      const branchIssue = result.error.issues.find((i) => i.path.includes('branch'));
      assert.ok(branchIssue, 'Should have a validation issue on branch');
      assert.strictEqual(
        branchIssue.message,
        'Branch is required. A student cannot be created without a branch.'
      );
    }
  });

  it('accepts student creation when branch is valid', () => {
    const result = StudentSchema.safeParse({ ...baseStudent, branch: 'Main Campus' });
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.branch, 'Main Campus');
    }
  });

  it('frontend students page enforces branch selection and displays branch column', () => {
    const pagePath = path.resolve(REPO_ROOT, 'frontend/app/dashboard/students/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');

    assert.ok(
      content.includes('Branch is required. A student cannot be created without a branch.'),
      'Frontend must validate branch non-emptiness before submit'
    );
    assert.ok(
      content.includes('<TableHead>Branch</TableHead>'),
      'Frontend table must render Branch header column'
    );
  });

  it('frontend students store schema strictly defines branch as required string', () => {
    const storePath = path.resolve(REPO_ROOT, 'frontend/lib/students-store.ts');
    const content = fs.readFileSync(storePath, 'utf8');

    assert.ok(
      content.includes('branch: string;'),
      'StoredStudent.branch must be non-optional string'
    );
    assert.strictEqual(
      content.includes('branch?: string;'),
      false,
      'StoredStudent.branch must not be optional'
    );
  });
});

describe('Fee Structure Branch Requirement Enforcement', () => {
  const baseStructure = {
    structureId: 'FEE-001',
    structureName: 'Class 10 Annual',
    courseGroup: 'Class 10 (GRP-001)',
    feeType: 'Tuition Fee',
    amount: '12000',
    frequency: 'Annual',
    dueDate: '2026-04-10',
    lateFee: '200',
    paymentMethods: ['Cash', 'UPI'],
    status: 'Unpaid',
    description: 'Annual tuition fee',
    studentIds: ['STU-001'],
  };

  it('rejects fee structure creation when branch is missing', () => {
    const result = FeeStructureSchema.safeParse({ ...baseStructure });
    assert.strictEqual(result.success, false);
    if (!result.success) {
      const branchIssue = result.error.issues.find((i) => i.path.includes('branch'));
      assert.ok(branchIssue, 'Should have a validation issue on branch');
    }
  });

  it('rejects fee structure creation when branch is empty or whitespace', () => {
    const result = FeeStructureSchema.safeParse({ ...baseStructure, branch: '   ' });
    assert.strictEqual(result.success, false);
    if (!result.success) {
      const branchIssue = result.error.issues.find((i) => i.path.includes('branch'));
      assert.ok(branchIssue, 'Should have a validation issue on branch');
      assert.strictEqual(
        branchIssue.message,
        'Branch is required. A fee structure cannot be created without a branch.'
      );
    }
  });

  it('accepts fee structure creation when branch is provided', () => {
    const result = FeeStructureSchema.safeParse({ ...baseStructure, branch: 'Main Campus' });
    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.branch, 'Main Campus');
    }
  });

  it('frontend fee structure page enforces branch selection, quick-select button, and table column', () => {
    const pagePath = path.resolve(REPO_ROOT, 'frontend/components/fee-structure-page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');

    assert.ok(
      content.includes('Branch is required. A fee structure cannot be created without a branch.'),
      'Frontend must validate branch non-emptiness before submit'
    );
    assert.ok(
      content.includes('<TableHead>Branch</TableHead>'),
      'Frontend table must render Branch header column'
    );
    assert.ok(
      content.includes('Select all {form.branch} students'),
      'Frontend should provide quick-select button for students in selected branch'
    );
  });

  it('frontend fee structures store schema defines branch as required string', () => {
    const storePath = path.resolve(REPO_ROOT, 'frontend/lib/fee-structures-store.ts');
    const content = fs.readFileSync(storePath, 'utf8');

    assert.ok(
      content.includes('branch: string;'),
      'StoredFeeStructure.branch must be non-optional string'
    );
  });
});

describe('WhatsApp Message Delivery & E2EE Decrypt Lock Prevention', () => {
  it('whatsapp.ts sends payment links as verified direct text to prevent E2EE decrypt lock', () => {
    const waPath = path.resolve(REPO_ROOT, 'backend/src/whatsapp.ts');
    const content = fs.readFileSync(waPath, 'utf8');

    // Should NOT use relayMessage with buildCtaUrlMessage in performSend which causes "Waiting for this message"
    assert.strictEqual(
      content.includes('await sock.relayMessage(jid, waMsg.message'),
      false,
      'Must not send unverified interactive message via relayMessage'
    );

    // Must deliver formatted text directly via sendMessage
    assert.ok(
      content.includes('const sent = await sock.sendMessage(jid, { text: fullText });'),
      'Must deliver payment CTA via standard sendMessage with full formatted text'
    );
  });

  it('whatsapp.ts getMessage returns undefined on cache miss rather than empty object', () => {
    const waPath = path.resolve(REPO_ROOT, 'backend/src/whatsapp.ts');
    const content = fs.readFileSync(waPath, 'utf8');

    assert.strictEqual(
      content.includes('return proto.Message.fromObject({});'),
      false,
      'getMessage must not return empty object which corrupts Signal retry ratchets'
    );
  });
});
