/* Cron webhook auth check, public portal, payments settings sync */
const TOK = process.env.TOK;
const BASE = 'http://127.0.0.1:4000';
const H = { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' };
const out = [];
async function jf(url, opts = {}) {
  const res = await fetch(url, opts);
  let json; try { json = await res.json(); } catch { json = { raw: await res.text() }; }
  return { status: res.status, json };
}

// 1. cron webhook without key
const r1 = await jf(`${BASE}/api/reminders/cron/monthly`);
out.push({ scope: 'cron-no-key', status: r1.status, res: r1.json });

// 2. cron webhook with WRONG key
const r2 = await jf(`${BASE}/api/reminders/cron/monthly`, { headers: { 'X-Cron-Key': 'wrong-key' } });
out.push({ scope: 'cron-wrong-key', status: r2.status, res: r2.json });

// 3. cron webhook with RIGHT key
const r3 = await jf(`${BASE}/api/reminders/cron/monthly`, { headers: { 'X-Cron-Key': 'e18b6345eb18f92e4fb1081043a4764ce2b55a43ed13e1ddd355da25e4efb615' } });
out.push({
  scope: 'cron-right-key', status: r3.status,
  note: 'which profile did the cron run for?',
  runProfile: r3.json?.message, runLogStatus: r3.json?.runLog?.status, details: r3.json?.runLog?.details,
  recipients: (r3.json?.runLog?.recipients || []).map(x => `${x.studentName}/${x.amount}`),
});

// 4. public portal
const slug = 'myenum';
const p1 = await jf(`${BASE}/api/public/profile/${slug}`);
out.push({ scope: 'public-profile', status: p1.status, name: p1.json?.data?.name ?? p1.json?.data?.profileId, keys: p1.json?.data ? Object.keys(p1.json.data) : p1.json });

const p2 = await jf(`${BASE}/api/public/payments/create`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug, studentId: 'STU-001', studentName: 'Amarnath Mk', amount: 10, method: 'UPI' }),
});
out.push({ scope: 'public-pay-create', status: p2.status, orderId: p2.json?.data?.orderId, url: p2.json?.data?.paymentUrl, err: p2.json?.error });

// 5. payments settings sync (gateway UPI VPA push)
const p3 = await jf(`${BASE}/api/payments/settings/sync`, { method: 'POST', headers: H, body: '{}' });
out.push({ scope: 'settings-sync', status: p3.status, res: p3.json });

// 6. bad method on checkout create
const p4 = await jf(`${BASE}/api/payments/create`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ studentName: 'X', amount: 10, method: 'NETBANKING' }),
});
out.push({ scope: 'bad-method', status: p4.status, res: p4.json });

// 7. zero / negative amount
const p5 = await jf(`${BASE}/api/payments/create`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ studentName: 'X', amount: 0, method: 'CASH_COUNTER' }),
});
out.push({ scope: 'zero-amount', status: p5.status, res: p5.json });

console.log(JSON.stringify(out, null, 2));
