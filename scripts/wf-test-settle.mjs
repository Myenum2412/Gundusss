/* Complete the two UPI sessions via gateway test-mode inject, then verify settlement */
const GW = 'http://127.0.0.1:6100';
const BASE = 'http://127.0.0.1:4000';
const ADMIN = '308bfd1c7c4729f8d3271a46ffe4367b66525b8137f21bb4f9e27161c4e17d78';
const TOK = process.env.TOK;
const H = { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' };
const GA = { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' };

const injects = [
  {
    orderId: 'FEE-1793255807073-af88f247', paymentId: 'e17a7e58-872a-481b-aa1c-f44a05c2cd42', feeId: 2,
    sender: 'VM-HDFCBK', message: 'A/C XX1234 credited by Rs 10.00 CR. Ref 811111111101.',
  },
  {
    orderId: 'FEE-1793255809803-4a74a8ec', paymentId: 'dbc3fcc3-5d74-4451-9c96-7ac582362c94', feeId: 3,
    sender: 'VM-HDFCBK', message: 'A/C XX5678 credited by Rs 10.00 CR. Ref 811111111102.',
  },
];

async function jf(url, opts = {}) {
  const res = await fetch(url, opts);
  let json; try { json = await res.json(); } catch { json = { raw: await res.text() }; }
  return { status: res.status, json };
}

const results = [];
const tm = await jf(`${GW}/api/v1/admin/dev/test-mode`, { method: 'POST', headers: GA, body: JSON.stringify({ enabled: true }) });
results.push({ scope: 'test-mode-enable', status: tm.status, res: tm.json });

for (const inj of injects) {
  const r = await jf(`${GW}/api/v1/admin/dev/test-mode/inject`, {
    method: 'POST', headers: GA,
    body: JSON.stringify({ source: 'SMS', sender: inj.sender, message: inj.message, paymentSessionId: inj.paymentId }),
  });
  results.push({ scope: 'inject', orderId: inj.orderId, status: r.status, res: r.json });
  await new Promise((res) => setTimeout(res, 1200)); // allow webhook delivery
  const pay = await jf(`${BASE}/api/payments/${inj.orderId}`, { headers: H });
  results.push({
    scope: 'backend-order-after-inject', orderId: inj.orderId, status: pay.status,
    summary: {
      status: pay.json?.data?.status, gatewayStatus: pay.json?.data?.gatewayStatus,
      receiptId: pay.json?.data?.receiptId, utr: pay.json?.data?.utr, events: (pay.json?.data?.events || []).length,
    },
  });
}

// Bills after settlement
const fees = await jf(`${BASE}/api/fees`, { headers: H });
results.push({ scope: 'fees-after', rows: fees.json?.data?.map(f => ({ id: f.id, status: f.status, amount: f.amount })) });
const receipts = await jf(`${BASE}/api/receipts`, { headers: H });
results.push({ scope: 'receipts-after', rows: receipts.json?.data?.map(r => ({ id: r.receiptId, amount: r.amount, status: r.status, student: r.studentName })) });

console.log(JSON.stringify(results, null, 2));
