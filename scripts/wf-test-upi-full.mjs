/* Full UPI lifecycle: register customer -> bind -> observe -> verify webhook settles backend */
const GW = 'http://127.0.0.1:6100';
const BASE = 'http://127.0.0.1:4000';
const ADMIN = '308bfd1c7c4729f8d3271a46ffe4367b66525b8137f21bb4f9e27161c4e17d78';
const TOK = process.env.TOK;
const H = { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' };

const sessionInfos = [
  {
    orderId: 'FEE-1793255807073-af88f247', paymentId: 'e17a7e58-872a-481b-aa1c-f44a05c2cd42', feeId: 2,
    cust: { name: 'TEST Prince', email: 'wf.prince@example.com', mobileNumber: '6374984055' },
    sender: 'VM-HDFCBK',
    text: 'A/C XX1234 credited by Rs 10.00 CR. Ref 822222222201.',
  },
  {
    orderId: 'FEE-1793255809803-4a74a8ec', paymentId: 'dbc3fcc3-5d74-4451-9c96-7ac582362c94', feeId: 3,
    cust: { name: 'TEST Sathish', email: 'wf.sathish@example.com', mobileNumber: '8825957384' },
    sender: 'VM-HDFCBK',
    text: 'A/C XX5678 credited by Rs 10.00 CR. Ref 822222222202.',
  },
];

async function jf(url, opts = {}) {
  const res = await fetch(url, opts);
  let json; try { json = await res.json(); } catch { json = { raw: await res.text() }; }
  return { status: res.status, json };
}
const results = [];

for (const info of sessionInfos) {
  const reg = await jf(`${GW}/api/v1/customer/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...info.cust, password: 'Cust@123456' }),
  });
  results.push({ scope: 'register', who: info.cust.mobileNumber, status: reg.status, ok: reg.json.success ?? reg.json.error, token: !!reg.json.token });
  const token = reg.json.token;
  if (!token) { results.push({ scope: 'abort-no-token', who: info.cust.mobileNumber, reg: reg.json }); continue; }

  const bind = await jf(`${GW}/api/v1/checkout/${info.paymentId}/bind-customer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ customerId: reg.json.customerId }),
  });
  results.push({ scope: 'bind', paymentId: info.paymentId, status: bind.status, res: { success: bind.json.success, status: bind.json.status, expiresAt: bind.json.expiresAt, error: bind.json.error } });

  const obs = await jf(`${GW}/api/v1/checkout/${info.paymentId}/simulate-observation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` },
    body: JSON.stringify({ source: 'SMS', sender: info.sender, rawText: info.text, isTest: true, testModeActive: true }),
  });
  results.push({ scope: 'observe', paymentId: info.paymentId, status: obs.status, outcome: { success: obs.json.success, status: obs.json.status, outcomeStatus: obs.json.result?.status, attributed: obs.json.result?.attributed } });

  // Wait for the 5s grace timer + webhook delivery
  await new Promise(r => setTimeout(r, 7000));

  const pay = await jf(`${BASE}/api/payments/${info.orderId}`, { headers: H });
  results.push({
    scope: 'backend-order', orderId: info.orderId, httpStatus: pay.status,
    status: pay.json?.data?.status, gatewayStatus: pay.json?.data?.gatewayStatus,
    receiptId: pay.json?.data?.receiptId, utr: pay.json?.data?.utr, payerVpa: pay.json?.data?.payerVpa,
    events: (pay.json?.data?.events || []).map(e => `${e.status}/${e.source}`),
  });
}

const fees = await jf(`${BASE}/api/fees`, { headers: H });
results.push({ scope: 'fees-after', rows: fees.json?.data?.map(f => ({ id: f.id, status: f.status, amount: f.amount, name: f.student_name })) });
const receipts = await jf(`${BASE}/api/receipts`, { headers: H });
results.push({ scope: 'receipts-after', rows: receipts.json?.data?.map(r => ({ id: r.receiptId, amount: r.amount, status: r.status, student: r.studentName, method: r.method, ref: r.reference ?? r.notes })) });

console.log(JSON.stringify(results, null, 2));
