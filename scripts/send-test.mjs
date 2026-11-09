import '../backend/dist/env.js';
import { startWa, getWaState, sendWaMessage, waSessionKeyFor } from '../backend/dist/whatsapp.js';
import { listUsers } from '../backend/dist/users.js';
import { listScopedRecords, DB_TABLES } from '../backend/dist/db.js';
import fs from 'node:fs';
import path from 'node:path';

const TARGET_EMAIL = process.argv[2] || 'myenumam@gmail.com';

async function main() {
  console.log(`\n==============================================`);
  console.log(` WhatsApp Test Send Runner: ${TARGET_EMAIL}`);
  console.log(`==============================================\n`);

  const users = await listUsers();
  const user = users.find(u => u.email.toLowerCase() === TARGET_EMAIL.toLowerCase());
  if (!user) {
    console.error(`User not found: ${TARGET_EMAIL}`);
    process.exit(1);
  }
  console.log(`User: ${user.name} (${user.email}), Workspace Profile: ${user.profile_id}`);

  const students = await listScopedRecords(DB_TABLES.students, user.profile_id);
  const student = students.find(s => s.entityId === 'STU-001') || students[0];
  if (!student) {
    console.error(`No students found in workspace ${user.profile_id}`);
    process.exit(1);
  }

  const phone = student.data.phone || '+91 7708332412';
  const studentName = student.data.studentName || 'Student';
  console.log(`Recipient: ${studentName} (${phone})`);

  console.log(`\nInitializing WhatsApp session for ${TARGET_EMAIL}...`);
  await startWa(TARGET_EMAIL);

  let lastQr = null;
  let attempts = 0;
  const maxAttempts = 300; // 10 minutes

  const poll = setInterval(async () => {
    attempts++;
    const state = getWaState(TARGET_EMAIL);

    if (state.status === 'qr' && state.qr && state.qr !== lastQr) {
      lastQr = state.qr;
      const base64Data = state.qr.replace(/^data:image\/png;base64,/, '');
      const qrPath = path.resolve('whatsapp-pair-now.png');
      fs.writeFileSync(qrPath, base64Data, 'base64');
      console.log(`\n[QR Updated] Fresh QR code saved to:\n  file:///${qrPath.replace(/\\/g, '/')}\n`);
      console.log(`Scan this QR code using WhatsApp on your phone (Linked Devices > Link a Device).`);
    }

    if (state.status === 'ready') {
      clearInterval(poll);
      console.log(`\n✅ WhatsApp is CONNECTED as +${state.connectedNumber}!`);
      console.log(`Sending interactive Call-to-Action URL reminder to ${phone}...`);

      const message = `🔔 *Monthly Fee Payment Reminder*\n\nDear Parent / Student *${studentName}*,\n\nThis is your monthly fee reminder for *${student.data.course || 'General'}* (${student.data.group || 'Batch'}).\n\n• Student ID: *${student.data.studentId}*\n• Monthly Fee: *₹5,000*\n• Due Date: *5th of this month*\n\nPlease tap the button below to pay directly via UPI / Card:\n\n— Myenum Accounts Desk`;

      const cta = {
        displayText: 'Pay Now',
        url: `https://pay.myenum.in/checkout/8df5ec7f-f076-42e0-8e66-e4eab0ddc5bb?student=${student.data.studentId}`,
        footer: 'Myenum Accounts Desk',
      };

      try {
        const res = await sendWaMessage(phone, message, [], cta, TARGET_EMAIL);
        console.log(`\n🎉 Test message SENT successfully!`);
        console.log(`WhatsApp Message ID: ${res.id}`);
        console.log(`Destination: ${phone}`);
        console.log(`Result: Native interactive CTA URL button bubble delivered to recipient!\n`);
        process.exit(0);
      } catch (sendErr) {
        console.error(`\n❌ Send failed:`, sendErr);
        process.exit(1);
      }
    }

    if (attempts >= maxAttempts) {
      clearInterval(poll);
      console.log(`\nPolling session timed out after 10 minutes. Run 'node scripts/send-test.mjs' whenever ready.`);
      process.exit(0);
    }
  }, 2000);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
