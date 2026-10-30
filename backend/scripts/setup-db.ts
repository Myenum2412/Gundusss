#!/usr/bin/env node
import '../src/env.js';
import { assertDatabaseSetup, getDatabaseStatus } from '../src/db.js';

async function main() {
  console.log('Initializing PostgreSQL database and tables...');
  await assertDatabaseSetup();
  const status = getDatabaseStatus();
  console.log('PostgreSQL database ready:');
  console.log(`  Database: ${status.database}`);
  console.log(`  Tables (${status.tables.length}): ${status.tables.join(', ')}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Database setup failed:', err);
  process.exit(1);
});
