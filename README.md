# Fees — Next.js + Fastify + YOUPI PG

Monorepo with workspaces:

```
fees/
  frontend/         Next.js 14 App Router (port 3000)
  backend/          Fastify 5 + node-postgres (port 4000)
  payment-gateway/  YOUPI PG self-hosted UPI gateway (payment API on 6100,
                    checkout on 7000, merchant admin on 6001)
  docker-compose.yml  Optional Postgres 16 for production-style local dev
```

## Quick start (local dev)

Local development needs **no Docker and no external Postgres**. The backend's
`npm run dev` starts an embedded PGlite server on port `5433`, points the
existing `pg` client at it, and creates the schema automatically. Data persists
in `backend/.pgdata/` (gitignored). Delete that folder to reset the database.

1. Install dependencies and create the env files:
```bash
npm install
copy backend\.env.example backend\.env
copy payment-gateway\.env.example payment-gateway\.env
# set ENCRYPTION_MASTER_KEY and JWT_SECRET in payment-gateway/.env
npm run gateway:install
```

2. Put the **same** random token in both env files:
```ini
# backend/.env
YOUPI_ADMIN_TOKEN=<shared-token>

# payment-gateway/.env
ADMIN_API_TOKEN=<shared-token>
```
The backend uses this token to sync the merchant UPI ID, read payment status,
and confirm or decline cash/card counter payments through the gateway admin API.

3. Point the gateway's default merchant webhook at the fees backend:
```bash
npm run gateway:webhook
```

4. Start all three services:
```bash
dev.bat
# or separately:
npm run dev:backend
npm run dev:frontend
npm run dev:gateway
```

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend health | http://localhost:4000/api/health |
| YOUPI payment API | http://localhost:6100 |
| YOUPI checkout | http://localhost:7000 |
| YOUPI merchant admin | http://localhost:6001 |

### Troubleshooting

**`RuntimeError: Aborted()` when the backend starts**

PGlite can abort if the process was killed while writing. Stop the backend and
remove the stale lock file first:

```powershell
Remove-Item backend\.pgdata\postmaster.pid -Force
npm run dev --workspace=backend
```

If it still aborts, move or delete `backend\.pgdata` and restart. The schema and
demo fees are re-created automatically. The database is disposable dev data.

**`/dashboard/...` returns 500 after a production build**

`next dev` and `next build` both use `.next`. Don't run `npm run build` while the
dev server is running; restart `npm run dev --workspace=frontend` afterwards.

### Using a real Postgres instead

`npm run dev:pg` (from `backend/`) skips PGlite and uses `DATABASE_URL` from
`backend/.env`. Start the bundled Postgres with:

```bash
docker compose up -d postgres
# schema is created at backend boot; or run backend/sql/init.sql manually
```

The PGlite dev server and a real Postgres cannot share port `5433`, so stop one
before starting the other.

## Payments (YOUPI PG)

The YOUPI PG gateway is vendored in `payment-gateway/` and runs as part of this
repo. The Payments page supports every method exposed by the gateway:

| Method | Checkout flow | Settles the fee? |
| :--- | :--- | :--- |
| `UPI` | In-app YOUPI checkout with a single-use QR | Yes, after the signed webhook |
| `CASH_COUNTER` | Counter instructions; staff confirms in Payments | Yes, after the signed webhook |
| `CARD_COUNTER` | Counter instructions; staff confirms in Payments | Yes, after the signed webhook |

UPI uses the embedded gateway checkout. Counter payments start as `ACTIVE`,
show the amount to collect, and are confirmed or declined from the payment row. YOUPI PG still sends the signed server-to-server webhook when a
counter payment is confirmed or a UPI transfer is verified. The backend verifies
the HMAC over the raw body, then:

- marks the matching row in `fees` as `paid` (explicit `feeId`, otherwise a
  pending/overdue fee matching the student name and amount), and
- creates exactly one receipt (`RCP-00x`) per order, idempotently.

The shared webhook secret is `COIN_STORE_WEBHOOK_SECRET` in
`payment-gateway/.env` and `YOUPI_WEBHOOK_SECRET` in `backend/.env`. Both files
are gitignored.

### UPI setup and checkout preview

Open **Dashboard → Payments → UPI payment setup**:

1. Enter the merchant **UPI ID** (for example `school@okhdfcbank`) and payee
   name.
2. Optionally upload the merchant **QR image** (PNG, JPG or WebP, max 2 MB).
3. Set the **Preview amount** to test the live checkout preview. The amount is
   embedded in the generated QR (`am`), so the QR and the amount label always
   match. This value is preview-only and does not change the saved fee amount.
4. Click **Save payment setup**.

Saving stores the profile in `payment_settings` and syncs the UPI ID / payee
name to the gateway's active receiving account through
`POST /api/v1/admin/upi-settings`. If the gateway is offline, the profile is
still saved locally, the card shows a pending-sync notice, and the backend
retries the sync before the next checkout. **Retry sync** is available in the
card.

> **QR note:** the uploaded QR is your merchant QR for the in-app preview and
> display. At checkout YOUPI PG creates a fresh **amount-specific** QR from the
> same UPI ID so its banking observers can match the exact transfer. This is what
> makes automatic receipt creation reliable.

### Counter payments

Choose **Cash at counter** or **Card at counter** when collecting a payment.
The order opens as `ACTIVE` and the dialog shows the amount to collect. When the
front desk receives the money, click **Confirm** on the payment row. The backend
calls `POST /api/v1/admin/counter-confirm` with `YOUPI_ADMIN_TOKEN`; YOUPI PG
emits the signed webhook, which creates the receipt and marks the fee paid.
**Decline** calls `POST /api/v1/admin/counter-decline` and closes the order as
`FAILED`. Counter confirmation requires the shared admin token described above.

### Payment status lifecycle

YOUPI PG lifecycle statuses:

`INITIATED`, `QUEUED`, `ACTIVE`, `PROCESSING`, `SUCCESS`, `FAILED`, `EXPIRED`,
`CANCELLED`

The app also displays `SUSPICIOUS`, `BLOCKED`, and `REFUNDED`. Every payment has
a colored status badge and a **History** timeline backed by the append-only
`payment_events` table. Use the status filter
above the table to view every state.

- `GET /api/payments/:id` reconciles non-terminal display status with the
  gateway using merchant-owner credentials and returns the event timeline.
- A gateway `SUCCESS` without a receipt is shown as `PROCESSING` with
  “Gateway confirmed · receipt pending”.
- Only the signed webhook creates the receipt and marks the fee paid. Polling
  never settles money.
- A late `FAILED` event cannot downgrade an order that is already `SUCCESS`.

### Local verification without a real bank SMS

A UPI session must be `ACTIVE` before an observation can be attributed. In
development you can register a gateway customer, bind it to the checkout, and
inject a synthetic bank message into the real verification pipeline:

```bash
# 1. Create a payment with POST /api/payments/create, then register a customer
curl -X POST http://localhost:6100/api/v1/customer/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Student","email":"test@example.com","mobileNumber":"9876543210","password":"Test123!"}'

# 2. Bind the returned token to the payment (activates the session)
curl -X POST http://localhost:6100/api/v1/checkout/<paymentId>/bind-customer \
  -H "Content-Type: application/json" \
  -d '{"token":"<customer-session-token>"}'

# 3. Inject the synthetic credit SMS (admin token required)
curl -X POST http://localhost:6100/api/v1/checkout/<paymentId>/simulate-observation \
  -H "Authorization: Bearer <ADMIN_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"source":"SMS","rawText":"A/C 1234 credited by Rs 2500.00 via UPI/987654321012","sender":"AD-HDFCBK","isTest":true}'
```

The gateway's real verification engine runs, then delivers the signed webhook to
the backend. The payment row should become `SUCCESS`, a receipt should appear,
and the matching fee should become `paid`.

## Docker (full stack)

The Docker path uses a real Postgres service instead of PGlite:

```bash
docker compose up --build
# frontend http://localhost:3000
# backend  http://localhost:4000/api/health
```

## API

- `GET /api/health`
- `GET /api/fees`
- `GET /api/fees/:id`
- `POST /api/fees` `{ student_name, amount, status, due_date: "YYYY-MM-DD" }`
- `PUT /api/fees/:id`
- `DELETE /api/fees/:id`
- `POST /api/payments/create` `{ studentId?, studentName, amount, feeId?, description?, method? }`
  (`method`: `UPI`, `CASH_COUNTER`, or `CARD_COUNTER`; defaults to `UPI`)
- `GET /api/payments`
- `GET /api/payments/:id` (includes the `events` lifecycle timeline)
- `POST /api/payments/:id/counter-confirm` `{ operatorId? }`
- `POST /api/payments/:id/counter-decline` `{ reason?, operatorId? }`
- `GET /api/payments/settings`
- `PUT /api/payments/settings` `{ upiId, payeeName, qrCodeDataUrl? }`
- `GET /api/payments/settings/qr?upiId=&payeeName=&amount=` (live QR preview)
- `POST /api/payments/settings/sync` (retry a pending YOUPI PG UPI sync)
- `POST /api/payments/webhook` (YOUPI PG → backend, HMAC-SHA256 verified)
