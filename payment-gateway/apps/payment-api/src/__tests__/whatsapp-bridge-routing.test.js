import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';

import { WhatsAppBerryService } from '../services/whatsapp-berry.service.js';

const TEST_DIR = path.join(os.tmpdir(), `youpi-bridge-routing-${process.pid}`);

function makeService() {
  const service = new WhatsAppBerryService({
    sessionId: 'bridge_test_session',
    sessionPath: path.join(TEST_DIR, 'auth'),
    databasePath: path.join(TEST_DIR, 'store.db'),
    metaFile: path.join(TEST_DIR, 'session.json')
  });
  // Skip the NODE_ENV=test simulation guardrail: we are asserting the bridge
  // request, not a real WhatsApp dispatch.
  service.forceRealDispatch = true;
  service.isSimulatedMode = false;
  service.status = 'DISCONNECTED';
  return service;
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

test('fees WhatsApp bridge routes to the configured workspace account', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    url: process.env.FEES_WHATSAPP_BRIDGE_URL,
    token: process.env.FEES_WHATSAPP_BRIDGE_TOKEN,
    user: process.env.FEES_WHATSAPP_BRIDGE_USER_EMAIL
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      FEES_WHATSAPP_BRIDGE_URL: originalEnv.url,
      FEES_WHATSAPP_BRIDGE_TOKEN: originalEnv.token,
      FEES_WHATSAPP_BRIDGE_USER_EMAIL: originalEnv.user
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.FEES_WHATSAPP_BRIDGE_URL = 'http://bridge.test';
  process.env.FEES_WHATSAPP_BRIDGE_TOKEN = 'bridge-token';
  process.env.FEES_WHATSAPP_BRIDGE_USER_EMAIL = 'myenumam@gmail.com';

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return jsonResponse({ data: { id: 'bridge_msg_1' } });
  };

  const service = makeService();
  const result = await service.sendMessage('9876543210', 'hello from the gateway');

  assert.equal(result.delivered, true);
  assert.equal(result.userEmail, 'myenumam@gmail.com');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://bridge.test/api/whatsapp/internal/send');
  assert.equal(calls[0].init.headers['X-WhatsApp-Bridge-Token'], 'bridge-token');
  assert.deepEqual(calls[0].body, {
    to: '9876543210',
    message: 'hello from the gateway',
    userEmail: 'myenumam@gmail.com'
  });
});

test('fees WhatsApp bridge falls back through a comma-separated account list', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    url: process.env.FEES_WHATSAPP_BRIDGE_URL,
    token: process.env.FEES_WHATSAPP_BRIDGE_TOKEN,
    user: process.env.FEES_WHATSAPP_BRIDGE_USER_EMAIL
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      FEES_WHATSAPP_BRIDGE_URL: originalEnv.url,
      FEES_WHATSAPP_BRIDGE_TOKEN: originalEnv.token,
      FEES_WHATSAPP_BRIDGE_USER_EMAIL: originalEnv.user
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.FEES_WHATSAPP_BRIDGE_URL = 'http://bridge.test';
  process.env.FEES_WHATSAPP_BRIDGE_TOKEN = 'bridge-token';
  process.env.FEES_WHATSAPP_BRIDGE_USER_EMAIL =
    'first@example.com, myenumam@gmail.com';

  const seen = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push(body.userEmail);
    if (body.userEmail === 'first@example.com') {
      return jsonResponse(
        { error: 'WhatsApp is not connected. Scan the QR code on the Settings page first.' },
        409
      );
    }
    return jsonResponse({ data: { id: 'bridge_msg_2' } });
  };

  const service = makeService();
  const result = await service.sendMessage('9876543210', 'fallback test');

  assert.equal(result.delivered, true);
  assert.equal(result.userEmail, 'myenumam@gmail.com');
  assert.deepEqual(seen, ['first@example.com', 'myenumam@gmail.com']);
});

test('fees WhatsApp bridge keeps the legacy system session when no account is configured', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    url: process.env.FEES_WHATSAPP_BRIDGE_URL,
    token: process.env.FEES_WHATSAPP_BRIDGE_TOKEN,
    user: process.env.FEES_WHATSAPP_BRIDGE_USER_EMAIL
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      FEES_WHATSAPP_BRIDGE_URL: originalEnv.url,
      FEES_WHATSAPP_BRIDGE_TOKEN: originalEnv.token,
      FEES_WHATSAPP_BRIDGE_USER_EMAIL: originalEnv.user
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.FEES_WHATSAPP_BRIDGE_URL = 'http://bridge.test';
  process.env.FEES_WHATSAPP_BRIDGE_TOKEN = 'bridge-token';
  delete process.env.FEES_WHATSAPP_BRIDGE_USER_EMAIL;

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return jsonResponse({ data: { id: 'bridge_msg_3' } });
  };

  const service = makeService();
  const result = await service.sendMessage('9876543210', 'system session test');

  assert.equal(result.delivered, true);
  assert.equal(result.userEmail, null);
  assert.deepEqual(calls[0], {
    to: '9876543210',
    message: 'system session test'
  });
});
