/* Workflow test — payments creation (UPI + counter) for the 3 bill rows */
const BASE = 'http://127.0.0.1:4000';
const TOK = process.env.TOK;
const H = { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' };
const out = [];

async function call(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  let json;
  try { json = await res.json(); } catch { json = { raw: await res.text() }; }
  return { status: res.status, json };
}

const students = (await call('/api/students')).json.data;
const fees = (await call('/api/fees')).json.data;

const targets = [
  { student: students.find(s => s.phone === '6374984055'), fee: fees.find(f => f.id === 2) },
  { student: students.find(s => s.phone === '8825957384'), fee: fees.find(f => f.id === 3) },
];

const created = [];
for (const { student, fee } of targets) {
  const body = {
    studentId: student.studentId,
    studentName: student.studentName,
    amount: Number(fee.amount),
    feeId: fee.id,
    email: student.email || 'test@example.com',
    phone: student.phone,
    description: `Workflow test bill #${fee.id} for ${student.studentName}`,
    method: 'UPI',
  };
  const r = await call('/api/payments/create', { method: 'POST', body: JSON.stringify(body) });
  out.push({ scope: 'upi-create', student: student.studentName, status: r.status, res: r.json });
  if (r.json?.data) created.push(r.json.data);
}

// Counter (cash) session for the first student
const { student, fee } = targets[0];
const r2 = await call('/api/payments/create', {
  method: 'POST',
  body: JSON.stringify({
    studentId: student.studentId, studentName: student.studentName,
    amount: Number(fee.amount), feeId: fee.id, email: student.email,
    phone: student.phone, method: 'CASH_COUNTER',
    description: 'Counter cash workflow test',
  }),
});
out.push({ scope: 'cash-create', status: r2.status, res: r2.json });
if (r2.json?.data) created.push(r2.json.data);

// Card counter session
const r3 = await call('/api/payments/create', {
  method: 'POST',
  body: JSON.stringify({
    studentId: targets[1].student.studentId, studentName: targets[1].student.studentName,
    amount: Number(fee.amount), feeId: targets[1].fee.id, email: student.email,
    phone: targets[1].student.phone, method: 'CARD_COUNTER',
    description: 'Counter card workflow test',
  }),
});
out.push({ scope: 'card-create', status: r3.status, res: r3.json });
if (r3.json?.data) created.push(r3.json.data);

console.log(JSON.stringify({ out, created }, null, 2));
