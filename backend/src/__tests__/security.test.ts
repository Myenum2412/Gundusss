import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// 1. GND-AUTH-001: Super-Admin Fallback Password & Persistence
// ---------------------------------------------------------------------------
describe('GND-AUTH-001: Super-Admin Credentials & Persistence', () => {
  it('SUPER_ADMIN_PASSWORD must not default to hardcoded @Meenu2412 in source', () => {
    const tenantFilePath = path.resolve(REPO_ROOT, 'backend/src/tenant.ts');
    const content = fs.readFileSync(tenantFilePath, 'utf8');
    assert.strictEqual(
      content.includes('@Meenu2412'),
      false,
      'Hardcoded password @Meenu2412 must be completely removed from tenant.ts'
    );
  });

  it('ensureDeveloperAccount must preserve existing administrator password hash on reboot', () => {
    const profilesFilePath = path.resolve(REPO_ROOT, 'backend/src/profiles.ts');
    const content = fs.readFileSync(profilesFilePath, 'utf8');

    // Verify it doesn't unconditionally overwrite hash or test verifyPassword against default
    assert.strictEqual(
      content.includes('passwordOk ? existing.password_hash : await hashPassword(SUPER_ADMIN_PASSWORD)'),
      false,
      'Boot initialization routine must never overwrite password_hash on hash mismatch'
    );
    assert.ok(
      content.includes('SUPER_ADMIN_FORCE_RESET'),
      'Password reset should only occur when SUPER_ADMIN_FORCE_RESET is explicitly set'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. GND-AUTH-002: Gateway Auth Gate & Token Exposure Prevention
// ---------------------------------------------------------------------------
describe('GND-AUTH-002: Gateway Admin Authorization Gate & Token Protection', () => {
  it('GET /api/auth/gate route must enforce user.super === true and reject non-super users with 403', () => {
    const authRouteFilePath = path.resolve(REPO_ROOT, 'backend/src/routes/auth.ts');
    const content = fs.readFileSync(authRouteFilePath, 'utf8');

    assert.ok(
      content.includes('user.super === true'),
      'Gate must verify user.super === true'
    );
    assert.ok(
      content.includes('.code(403)'),
      'Gate must return HTTP 403 Forbidden when user is not super-admin'
    );
  });

  it('merchant-admin server.js must never inject ADMIN_API_TOKEN into HTML body', () => {
    const serverJsPath = path.resolve(
      'D:/Gundusss/payment-gateway/apps/merchant-admin/src/server.js'
    );
    const content = fs.readFileSync(serverJsPath, 'utf8');

    assert.strictEqual(
      content.includes("html.replaceAll('{{ADMIN_API_TOKEN}}', getAdminToken())"),
      false,
      'renderHtml must not inject getAdminToken() directly into HTML'
    );
    assert.ok(
      content.includes("html.replaceAll('{{ADMIN_API_TOKEN}}', '')"),
      'renderHtml must replace {{ADMIN_API_TOKEN}} with empty string'
    );
  });
});

// ---------------------------------------------------------------------------
// 3. GND-INFO-001: Public Student PII Masking
// ---------------------------------------------------------------------------
describe('GND-INFO-001: Student PII Protection on Public Endpoints', () => {
  function maskPhone(phone?: string): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) return '****';
    return `${digits.slice(0, 2)}${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-2)}`;
  }

  function maskEmail(email?: string): string {
    if (!email || !email.includes('@')) return '';
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `*@${domain}`;
    return `${local.slice(0, 2)}***@${domain}`;
  }

  it('maskPhone correctly masks Indian mobile numbers', () => {
    assert.strictEqual(maskPhone('9876543210'), '98******10');
    assert.strictEqual(maskPhone('+91 98765 43210'), '91********10');
    assert.strictEqual(maskPhone(''), '');
  });

  it('maskEmail correctly masks email addresses', () => {
    assert.strictEqual(maskEmail('student@example.com'), 'st***@example.com');
    assert.strictEqual(maskEmail('amarnath@myenum.in'), 'am***@myenum.in');
    assert.strictEqual(maskEmail(''), '');
  });

  it('payments.ts routes must use maskPhone and maskEmail on public student records', () => {
    const paymentsFilePath = path.resolve(REPO_ROOT, 'backend/src/routes/payments.ts');
    const content = fs.readFileSync(paymentsFilePath, 'utf8');

    assert.ok(
      content.includes('phone: maskPhone(s.phone)'),
      'Public profile must mask phone numbers'
    );
    assert.ok(
      content.includes('email: maskEmail(s.email)'),
      'Public profile must mask email addresses'
    );
  });
});

// ---------------------------------------------------------------------------
// 4. GND-SEC-001: Cryptographic Key Separation
// ---------------------------------------------------------------------------
describe('GND-SEC-001: Cryptographic Key Separation & Auth Secret', () => {
  it('backend/src/auth.ts must not fall back to APPWRITE_API_KEY for session signing', () => {
    const authFilePath = path.resolve(REPO_ROOT, 'backend/src/auth.ts');
    const content = fs.readFileSync(authFilePath, 'utf8');

    assert.strictEqual(
      content.includes('process.env.APPWRITE_API_KEY?.trim()'),
      false,
      'Must not multiplex APPWRITE_API_KEY as session signing secret'
    );
    assert.ok(
      content.includes("NODE_ENV === 'production'"),
      'Must check production environment and fail closed if AUTH_SECRET is missing'
    );
  });
});

// ---------------------------------------------------------------------------
// 5. GND-SUPP-001: Dependency Reproducibility & Lockfile Enforcement
// ---------------------------------------------------------------------------
describe('GND-SUPP-001: Dependency Lockfile Integrity & Deploy Enforcement', () => {
  it('backend/package-lock.json and frontend/package-lock.json must exist and be valid JSON', () => {
    const backendLock = path.resolve(REPO_ROOT, 'backend/package-lock.json');
    const frontendLock = path.resolve(REPO_ROOT, 'frontend/package-lock.json');

    assert.ok(fs.existsSync(backendLock), 'backend/package-lock.json must exist');
    assert.ok(fs.existsSync(frontendLock), 'frontend/package-lock.json must exist');

    const backendJson = JSON.parse(fs.readFileSync(backendLock, 'utf8'));
    const frontendJson = JSON.parse(fs.readFileSync(frontendLock, 'utf8'));

    assert.strictEqual(backendJson.name, 'backend');
    assert.strictEqual(frontendJson.name, 'frontend');
  });

  it('deploy.sh must strictly use npm ci without falling back to unpinned npm install', () => {
    const deployShPath = path.resolve(REPO_ROOT, 'deploy.sh');
    const content = fs.readFileSync(deployShPath, 'utf8');

    assert.strictEqual(
      content.includes('|| (cd backend && npm install'),
      false,
      'deploy.sh must not fall back to npm install for backend'
    );
    assert.strictEqual(
      content.includes('|| (cd payment-gateway && npm install'),
      false,
      'deploy.sh must not fall back to npm install for gateway'
    );
    assert.ok(
      content.includes('(cd backend && npm ci --no-audit --no-fund)'),
      'deploy.sh must enforce npm ci for backend'
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Cross-Tenant Isolation & Role Protection
// ---------------------------------------------------------------------------
describe('Cross-Tenant Isolation & Access Protection', () => {
  it('resolveProfileId must reject profile-switching for non-super users', () => {
    const profilesFilePath = path.resolve(REPO_ROOT, 'backend/src/profiles.ts');
    const content = fs.readFileSync(profilesFilePath, 'utf8');

    assert.ok(
      content.includes("throw Object.assign(new Error('User is not assigned to a workspace profile.')"),
      'resolveProfileId must throw 403 if non-super user has missing workspace profile'
    );
  });

  it('server.ts must enforce security headers on all responses', () => {
    const serverFilePath = path.resolve(REPO_ROOT, 'backend/src/server.ts');
    const content = fs.readFileSync(serverFilePath, 'utf8');

    assert.ok(content.includes('X-Content-Type-Options'), 'Must set nosniff header');
    assert.ok(content.includes('X-Frame-Options'), 'Must set SAMEORIGIN frame option');
    assert.ok(content.includes('Referrer-Policy'), 'Must set strict-origin referrer policy');
  });
});
