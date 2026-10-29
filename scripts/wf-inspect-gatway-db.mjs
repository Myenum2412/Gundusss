/* Inspect gateway SQLite: merchant webhook config + recent webhook deliveries + payment sessions */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('D:/Gundusss/payment-gateway/data/youpi_pg.sqlite', { readOnly: true });

const cols = db.prepare("SELECT name FROM pragma_table_info('merchants')").all().map(c => c.name);
console.log('MERCHANT COLS:', cols.join(', '));
const merchants = db.prepare('SELECT * FROM merchants').all();
console.log('MERCHANTS:', JSON.stringify(merchants.map(m => ({ id: m.id, merchantId: m.merchant_id, webhookUrl: m.webhook_url, hasSecret: !!m.webhook_secret, appName: m.app_name })), null, 2));

const sessCols = db.prepare("SELECT name FROM pragma_table_info('payment_sessions')").all().map(c => c.name);
console.log('SESSION COLS:', sessCols.join(', '));

const sessions = db.prepare(`
  SELECT id, order_id, status, amount_paise, receiving_account_id, merchant_id, customer_id, attributed_observation_id, verification_level, completed_at
  FROM payment_sessions WHERE id IN ('e17a7e58-872a-481b-aa1c-f44a05c2cd42','dbc3fcc3-5d74-4451-9c96-7ac582362c94')`).all();
console.log('SESSIONS:', JSON.stringify(sessions, null, 2));

const deliveries = db.prepare('SELECT id, event_type, endpoint_url, response_status, response_body, attempt_count, is_successful, created_at FROM webhook_deliveries ORDER BY created_at DESC LIMIT 10').all();
console.log('WEBHOOK_DELIVERIES:', JSON.stringify(deliveries, null, 2));
