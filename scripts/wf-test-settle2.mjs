/* Settlement tests: fresh E2E UPI, manual signed webhook replay, counter confirm/decline */
import crypto from 'node:crypto';
const GW = 'http://127.0.0.1:6100';
const BASE = 'http://127.0.0.1:4000';
const ADMIN = '308bfd1c7c4729f8d3271a46ffe4367b66525b8137f21bb4f9e27161c4e17d78';
const SECRET = 'cd771ae0c873557c016e2ca0e7f1e2601040cbf6b77893963c26bf7352102b4e';
const TOK = process.env.TOK;
const H = { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' };

async function jf(url, opts = {}) {
  const res = await fetch(url, opts);
  let json; try { json = await res.json(); } catch { json = { raw: await res.text() }; }
  return { status: res.status, json };
}
const r = [];
const log = (scope, v) => r.push({ scope, ...v });

// ---- Part A: fresh full E2E for fee#1 (Amarnath Mk, phone 7708332412) ----
const create = await jf(`${BASE}/api/payments/create`, {
  method: 'POST', headers: H,
  body: JSON.stringify({
    studentId: 'STU-001', studentName: 'Amarnath Mk', amount: 10, feeId: 1,
    email: 'myenumam2412@gmail.com', phone: '7708332412', method: 'UPI',
    description: 'Workflow test Nov bill #1',
  }),
});
log('A-create', { status: create.status, orderId: create.json?.data?.orderId, paymentId: create.json?.data?.paymentId, check: create.json?.data?.checkoutUrl, err: create.json?.error });

if (create.json?.data?.orderId) {
  const { orderId, paymentId } = create.json.data;
  const reg = await jf(`${GW}/api/v1/customer/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Amarnath Mk', email: 'wf.amar@example.com', mobileNumber: '7708332412', password: 'Cust@123456' }),
  });
  log('A-register', { status: reg.status, ok: !!reg.json.token || reg.json.error });
  const bind = await jf(`${GW}/api/v1/checkout/${paymentId}/bind-customer`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.json.token}` },
    body: JSON.stringify({ customerId: reg.json.customerId }),
  });
  log('A-bind', { status: bind.status, status_: bind.json.status, error: bind.json.error });
  const obs = await jf(`${GW}/api/v1/checkout/${paymentId}/simulate-observation`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ source: 'SMS', sender: 'VM-HDFCBK', rawText: 'A/C XX9999 credited by Rs 10.00 CR. Ref 822222222203.', isTest: true }),
  });
  log('A-observe', { status: obs.status, outcome: obs.json.status, attributed: obs.json.result?.attributed });
  await new Promise(r2 => setTimeout(r2, 6500));
  const pay = await jf(`${BASE}/api/payments/${orderId}`, { headers: H });
  log('A-order', { status: pay.json?.data?.status, receipt: pay.json?.data?.receiptId, utr: pay.json?.data?.utr, events: (pay.json?.data?.events || []).map(e => `${e.status}/${e.source}`) });
}

// ---- Part B: manual signed webhook for fee#2 (Prince, order from before the fix) ----
const payload = {
  event: 'SUCCESS', paymentId: 'e17a7e58-872a-481b-aa1c-f44a05c2cd42',
  orderId: 'FEE-1793255807073-af88f247', amount: '10.00', amountPaise: 1000,
  currency: 'INR', method: 'UPI', utr: '822222222201',
  completedAt: new Date().toISOString(),
  metadata: { profileId: 'ORG-KRG73BEG', studentId: 'STU-T2021', studentName: 'TEST Prince (6374984055)', feeId: 2, source: 'fee-reminder' },
};
const body = JSON.stringify(payload);
const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
const wh = await jf(`${BASE}/api/payments/webhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Gateway-Event': 'SUCCESS', 'X-Gateway-Signature': `sha256=${sig}`, 'X-Gateway-Delivery-Id': crypto.randomUUID(), 'X-Gateway-Timestamp': String(Date.now()) },
  body,
});
log('B-webhook-replay', { status: wh.status, res: wh.json });

// ---- Part C: counter payments — confirm the CASH session, decline the CARD session ----
const cc = await jf(`${BASE}/api/payments/FEE-1793255811120-525b5a54/counter-confirm`, { method: 'POST', headers: H, body: '{}' });
log('C-cash-confirm', { status: cc.status, res: cc.json });
await new Promise(r2 => setTimeout(r2, 3000));
const cd = await jf(`${BASE}/api/payments/FEE-1793255812505-096c0431/counter-decline`, { method: 'POST', headers: H, body: '{}' });
log('C-card-decline', { status: cd.status, res: cd.json });
await new Promise(r2 => setTimeout(r2, 3000));

// ---- Final state ----
const fees = await jf(`${BASE}/api/fees`, { headers: H });
log('final-fees', { rows: fees.json?.data?.map(f => ({ id: f.id, name: f.student_name, status: f.status })) });
const receipts = await jf(`${BASE}/api/receipts`, { headers: H });
log('final-receipts', { rows: receipts.json?.data?.map(x => ({ id: x.receiptId, student: x.studentName, amount: x.amount, status: x.status, method: x.method })) });
const orders = await jf(`${BASE}/api/payments`, { headers: H });
log('final-orders', { rows: orders.json?.data?.slice(0, 6).map(o => (`${o.orderId}: ${o.status} receipt=${o.receiptId ?? '-'} utr=${o.utr || '-'}`)) });

console.log(JSON.stringify(r, null, 2));
