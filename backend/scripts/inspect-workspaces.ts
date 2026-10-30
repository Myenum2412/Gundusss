import '../src/env.js';
import { listUsers } from '../src/users.js';
import { listProfiles } from '../src/profiles.js';
import { DB_TABLES, listScopedRecords } from '../src/db.js';

async function main() {
  const users = await listUsers();
  console.log('=== USERS ===');
  for (const u of users) {
    console.log('User:', u.email, '| Name:', u.name, '| Role:', u.role, '| ProfileId:', u.profile_id);
  }

  const profiles = await listProfiles();
  console.log('\n=== PROFILES ===');
  for (const p of profiles) {
    const students = await listScopedRecords(DB_TABLES.students, p.profileId);
    console.log('Profile:', p.profileId, '| Name:', p.name, '| Owner:', p.ownerEmail, '| Students Count:', students.length);
    for (const s of students) {
      console.log('   -> Student:', (s.data as any).studentId, '| Name:', (s.data as any).studentName, '| Phone:', (s.data as any).phone);
    }
  }
}
main().catch(console.error);
