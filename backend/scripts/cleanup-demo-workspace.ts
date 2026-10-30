import '../src/env.js';
import {
  DB_TABLES,
  deleteRecord,
  listScopedRecords,
} from '../src/db.js';

const DEMO_PROFILE_ID = 'ORG-2SXWUGA4';

async function cleanup() {
  console.log(`Starting cleanup of fake demo workspace ${DEMO_PROFILE_ID}...`);

  for (const [colName, colId] of Object.entries(DB_TABLES)) {
    try {
      const records = await listScopedRecords(colId, DEMO_PROFILE_ID);
      console.log(`Found ${records.length} records in ${colName} for ${DEMO_PROFILE_ID}`);
      for (const r of records) {
        await deleteRecord(colId, r.entityId);
        console.log(`  Deleted ${colName} record: ${r.entityId}`);
      }
    } catch (err) {
      console.error(`Error cleaning collection ${colName}:`, err);
    }
  }

  // Also delete the profile row from profiles table
  try {
    await deleteRecord(DB_TABLES.profiles, DEMO_PROFILE_ID);
    console.log(`Deleted profile row: ${DEMO_PROFILE_ID}`);
  } catch (err) {
    console.error(`Error deleting profile row:`, err);
  }

  console.log('Cleanup completed successfully!');
}

cleanup().catch(console.error);
