import '../src/env.js';
import { listScopedRecords, APPWRITE_COLLECTIONS } from '../src/appwrite.js';

async function inspect(profileId: string) {
  console.log('\n*** Records for', profileId, '***');
  for (const [name, col] of Object.entries(APPWRITE_COLLECTIONS)) {
    const records = await listScopedRecords(col, profileId);
    if (records.length > 0) {
      console.log('  Collection', name, ':', records.length, 'records');
      records.slice(0, 3).forEach((r) => console.log('     ->', JSON.stringify(r.data)));
    }
  }
}

async function main() {
  await inspect('ORG-KRG73BEG');
  await inspect('ORG-2SXWUGA4');
}
main().catch(console.error);
