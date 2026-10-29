import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Database } from '@youpi/db';
import { getAdminToken } from '@youpi/common';
import { startAdminServer } from '../index.js';

describe('Merchant Admin Integration Tests', () => {
  let serverInstance;
  let baseUrl;
  let testDb;
  let fakeGate;

  before(async () => {
    testDb = new Database({ inMemory: true });
    // Fake fees-backend gate: GET with x-fees-arg returns a verdict keyed on
    // the presented token (mirrors /api/auth/gate's response contract).
    fakeGate = http.createServer((req, res) => {
      const token = req.headers['x-fees-arg'] || '';
      const verdict =
        token === 'super-token' ? { ok: true, super: true } :
        token === 'basic-token' ? { ok: true, super: false } :
        { ok: false };
      res.writeHead(token === 'super-token' || token === 'basic-token' ? 200 : 401, {
        'Content-Type': 'application/json'
      });
      res.end(JSON.stringify(verdict));
    });
    await new Promise(resolve => fakeGate.listen(0, '127.0.0.1', resolve));
    const fakeGatePort = fakeGate.address().port;
    serverInstance = await startAdminServer(6101, { db: testDb, feesGateUrl: `http://127.0.0.1:${fakeGatePort}/api/auth/gate` });
    baseUrl = `http://localhost:${serverInstance.port}`;
  });

  after(async () => {
    await serverInstance.close();
    testDb.close();
    fakeGate.close();
  });

  function post(path, body) {
    const payload = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = http.request(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        }
      }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, text: data });
        });
      });
      req.on('error', reject);
      req.end(payload);
    });
  }

  function get(path, headers = {}) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, { headers }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, text: data });
        });
      }).on('error', reject);
    });
  }

  test('GET /health returns UP', async () => {
    const res = await get('/health');
    assert.equal(res.status, 200);
    const json = JSON.parse(res.text);
    assert.equal(json.status, 'UP');
    assert.equal(json.service, 'merchant-admin');
  });

  test('GET / renders dashboard with queue monitor, observers, counter desk & pairing modal', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/html'));

    assert.ok(res.text.includes('Real-Time Receiving Account Slot Ownership'));
    assert.ok(res.text.includes('Active Slot (5-Minute Window)'));
    assert.ok(res.text.includes('Processing Slot (30s Verification Window)'));
    assert.ok(res.text.includes('Live Counter Payment Requests'));
    assert.ok(res.text.includes('Payment Observers (SMS & Gmail)'));
    assert.ok(res.text.includes('Android SMS Gateway'));
    assert.ok(res.text.includes('Gmail Direct API'));
  });

  test('GET /api/admin/tickets requires the admin token', async () => {
    const anonymous = await get('/api/admin/tickets');
    assert.equal(anonymous.status, 401);

    const res = await get('/api/admin/tickets', { Authorization: `Bearer ${getAdminToken()}` });
    assert.equal(res.status, 200);
    const json = JSON.parse(res.text);
    assert.ok(Array.isArray(json));
  });

  test('Control Center supervisor proxy routes (/api/services* and /api/logs/stream) require the admin token', async () => {
    const anonServices = await get('/api/services');
    assert.equal(anonServices.status, 401);

    const wrongToken = await get('/api/services', { Authorization: 'Bearer wrong-token' });
    assert.equal(wrongToken.status, 401);

    const anonLogs = await get('/api/logs/stream');
    assert.equal(anonLogs.status, 401);

    const wrongQueryLogs = await get('/api/logs/stream?token=wrong-token');
    assert.equal(wrongQueryLogs.status, 401);
  });

  test('POST /api/admin/session exchanges a confirmed SUPER fees session for the admin token', async () => {
    const res = await post('/api/admin/session', { fees_token: 'super-token' });
    assert.equal(res.status, 200);
    const json = JSON.parse(res.text);
    assert.equal(json.adminToken, getAdminToken());
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  test('POST /api/admin/session refuses non-super sessions even when the fees session is valid', async () => {
    const res = await post('/api/admin/session', { fees_token: 'basic-token' });
    assert.equal(res.status, 401);
    assert.ok(!JSON.parse(res.text).adminToken);
  });

  test('POST /api/admin/session rejects fees tokens the gate rejects', async () => {
    const res = await post('/api/admin/session', { fees_token: 'not-a-session' });
    assert.equal(res.status, 401);
  });

  test('POST /api/admin/session requires a fees_token body field', async () => {
    const missing = await post('/api/admin/session', {});
    assert.equal(missing.status, 400);
  });
});
