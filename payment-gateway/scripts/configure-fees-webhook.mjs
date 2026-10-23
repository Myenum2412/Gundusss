// Points the default YOUPI PG merchant webhook at the fees backend.
//
// Run from the payment-gateway directory:
//   node --env-file=.env scripts/configure-fees-webhook.mjs
//
// The merchant repository encrypts the secret with ENCRYPTION_MASTER_KEY,
// so the value in the gateway database always matches
// COIN_STORE_WEBHOOK_SECRET (which the fees backend stores as
// YOUPI_WEBHOOK_SECRET).
import { getDatabase, MerchantRepository } from '@youpi/db';
import { getCoinStoreWebhookSecret } from '@youpi/common';

const db = getDatabase();
const repo = new MerchantRepository(db);
const merchant = repo.findAll()[0];

if (!merchant) {
  console.error('No merchant found. Run the migrations first (npm run db:setup).');
  process.exit(1);
}

const webhookUrl =
  process.env.COIN_STORE_WEBHOOK_URL || 'http://localhost:4000/api/payments/webhook';
const webhookSecret = getCoinStoreWebhookSecret();

repo.update(merchant.id, { webhookUrl, webhookSecret });

console.log(`[fees] Merchant ${merchant.businessName} (${merchant.id})`);
console.log(`[fees] Webhook URL -> ${webhookUrl}`);
console.log('[fees] Webhook secret rotated to COIN_STORE_WEBHOOK_SECRET.');
