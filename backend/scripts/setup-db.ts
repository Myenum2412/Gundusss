import '../src/env.js';
import { assertDatabaseSetup, getDatabaseStatus, pool } from '../src/db.js';

async function main() {
  console.log('Initializing PostgreSQL database schema...');
  await assertDatabaseSetup();
  const status = getDatabaseStatus();
  console.log('Database initialized successfully:');
  console.log('  Type:', status.type);
  console.log('  Database:', status.database);
  console.log('  Tables:', status.tables.join(', '));
  console.log('  Missing:', status.missingTables.length === 0 ? 'none' : status.missingTables.join(', '));
}

main()
  .catch((err) => {
    console.error('Database setup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
