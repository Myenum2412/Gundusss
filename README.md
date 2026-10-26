# Fees — Next.js + Fastify + YOUPI PG

Monorepo with workspaces:

```
fees/
  frontend/         Next.js 14 App Router (port 3000)
  backend/          Fastify 5 + Appwrite (port 4000)
  payment-gateway/  YOUPI PG self-hosted UPI gateway (payment API on 6100,
                    checkout on 7000, merchant admin on 6001)
  docker-compose.yml  Optional container setup for frontend + backend
```

## Quick start (local dev)

Appwrite is the app's primary database. Local development needs **no Postgres**
and no Docker.

1. Install dependencies and create the env files:
```bash
npm install
copy backend\.env.example backend\.env
copy payment-gateway\.env.example payment-gateway\.env
# set APPWRITE_API_KEY in backend/.env (scopes listed below)
# set ENCRYPTION_MASTER_KEY and JWT_SECRET in payment-gateway/.env
npm run gateway:install
```

2. Create the Appwrite database and tables:
```bash
npm run appwrite:setup --workspace=backend
# Optional, once: import data from the previous Postgres/PGlite setup
npm run appwrite:migrate --workspace=backend
```

3. Put the **same** random token in both env files:
```ini
# backend/.env
YOUPI_ADMIN_TOKEN=<shared-token>

# payment-gateway/.env
ADMIN_API_TOKEN=<shared-token>
```
The backend uses this token to sync the merchant UPI ID, read payment status,
and confirm or decline cash/card counter payments through the gateway admin API.

4. Point the gateway's default merchant webhook at the fees backend:
```bash
npm run gateway:webhook
```

5. Start everything in **one terminal**:
```bash
dev.bat          # Windows (double-click, or run from a terminal)
npm run dev      # PowerShell / Git Bash / macOS / Linux
```

The runner starts the backend first and waits for
`http://127.0.0.1:4000/api/health`, then starts the frontend (and the payment
gateway when `payment-gateway/node_modules` exists). Logs from every service are
prefixed in the same window; press **Ctrl+C** once to stop all of them.

Useful options: `npm run dev -- --no-gateway` (skip the gateway) or
`npm run dev -- --with-gateway` (require it). To run services individually:
`npm run dev:backend`, `npm run dev:frontend`, `npm run dev:gateway`.

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend health | http://localhost:4000/api/health |
| YOUPI payment API | http://localhost:6100 |
| YOUPI checkout | http://localhost:7000 |
| YOUPI merchant admin | http://localhost:6001 |

In production, set `YOUPI_PUBLIC_CHECKOUT_URL` in `backend/.env` (or the Compose
environment) to the public checkout portal origin, for example
`https://pay.myenum.in`. It is used to build the checkout links shown to staff
and students when the gateway itself advertises a loopback URL behind a reverse
proxy. If it is unset, the URL returned by the gateway is used unchanged.

### Troubleshooting

**`Cannot reach the payments backend at http://127.0.0.1:4000`**

Start the stack with `dev.bat` (or `npm run dev`). It waits for the backend
health check before launching the frontend, so the page cannot load while the
API is still booting.

If the API already runs on another port or you open the app from another device
(for example a phone on your LAN), create `frontend/.env.local` with the address
the browser can reach:

```ini
NEXT_PUBLIC_API_URL=http://192.168.1.10:4000
```

Then restart the frontend. Use an IP address rather than `localhost`, because
Windows may resolve `localhost` to IPv6 `::1` while the backend listens on IPv4.

**`missing scopes (["tables.write"])` during `appwrite:setup`**

The Appwrite API key needs `databases.read`, `databases.write`, `tables.read`,
`tables.write`, `columns.read`, `columns.write`, `rows.read`, and `rows.write`.
Edit the key in the Appwrite console, then run
`npm run appwrite:setup --workspace=backend` again.

**`Appwrite tables are missing` when the backend starts**

The database or tables have not been created for this project. Run
`npm run appwrite:setup --workspace=backend`, then restart the backend.

**`/dashboard/...` returns 500 after a production build**

`next dev` and `next build` both use `.next`. Don't run `npm run build` while the
dev server is running; restart `npm run dev --workspace=frontend` afterwards.

### Importing existing Postgres/PGlite data

The backend no longer reads Postgres. The one-time import script reads the old
database and upserts every row into Appwrite. It never deletes Appwrite data, so
it is safe to re-run.

```bash
# Terminal 1: start the embedded PGlite used by the previous dev setup
npm run legacy:pglite --workspace=backend

# Terminal 2: import it into Appwrite (auto-detects port 5433)
npm run appwrite:migrate --workspace=backend

# Or import a real Postgres connection:
# PowerShell:
$env:MIGRATE_DATABASE_URL="postgres://fees:fees@localhost:5432/fees"
npm run appwrite:migrate --workspace=backend
```

Keep `backend/.pgdata/` until the import has been verified. After that it is no
longer needed.

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

The public payment link (`/<organisation-slug>?student=...`) only shows a UPI QR
and app launchers when the workspace has a usable merchant VPA. Placeholder seed
values such as `merchant@upi` are rejected, and a missing VPA falls back to the
cash-counter pass instead of inventing one from the organisation phone number.
GPay, PhonePe and Paytm launchers are built with their own schemes
(`tez://upi/pay?`, `phonepe://pay?`, `paytmmp://pay?`) from the same validated
query, so they do not double the `pay?` path.

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

## Appwrite data store

Appwrite is the primary store for all app data: fees, users, students, student
groups, fee structures, receipts, announcements, dropdown options, payment
orders, payment events, payment settings, and the business profile.

Each table stores one row per entity:

| Column | Purpose |
| --- | --- |
| `entityId` | The app's logical id (fee id, student id, order id, etc.) |
| `payload` | The entity as JSON, exactly the shape the API returns |
| `createdAt` | Entity creation timestamp |
| `updatedAt` | Last write timestamp |

Row ids are deterministic hashes of `entityId`, so the backend can upsert
without first looking up the row. Payment receipt creation is additionally
serialized by an in-process lock and re-checks for an existing receipt before
allocating a new `RCP-00x`, because the app writes each row individually. The
`users` table stores bcrypt password hashes; it is private to the backend API
key.

The browser never stores app data or account details in `localStorage`. A
first-party session cookie holds the signed token (used only as a page gate),
the signed-in account is kept in memory, and every page loads its data from
Appwrite through the API. Old browser caches are cleared when the app starts.

1. In the Appwrite console, create a server API key for project
   `6adaf4be003ae5c9e622` with these scopes:
   `databases.read`, `databases.write`, `tables.read`, `tables.write`,
   `columns.read`, `columns.write`, `rows.read`, `rows.write`.
2. Add the key to `backend/.env`:
   ```bash
   APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
   APPWRITE_PROJECT_ID=6adaf4be003ae5c9e622
   APPWRITE_API_KEY=<server API key>
   APPWRITE_DATABASE_ID=fees
   ```
3. Create the database, tables, and columns:
   ```bash
   npm run appwrite:setup --workspace=backend
   ```
4. Restart the backend and check the connection:
   ```bash
   curl http://localhost:4000/api/appwrite/status
   ```

The backend seeds demo fees and dropdown options only when their tables are
empty. It does **not** create a default user: on a fresh install, open
`http://localhost:3000/login` and create the first administrator from the
first-run setup form. Additional accounts are created by an administrator on
**Dashboard → Users**.

Sessions are signed with `AUTH_SECRET` (add a long random value to
`backend/.env`; if unset the Appwrite API key is used as a fallback). Every
`/api/*` route except health, login, setup, logout, and the payment webhook
requires `Authorization: Bearer <token>`.

### Roles

| Role | Access |
| --- | --- |
| Administrator | Everything, including users and settings |
| Accountant | Students, fees, receipts, payments, announcements, and settings |
| Viewer | Read-only access to records |

Role changes apply without a re-login (user lookups are cached for 30 seconds).

## Docker (frontend + backend)

The backend container talks to the same Appwrite project. YOUPI PG is expected
to run on the host; Compose points the backend at `host.docker.internal:6100`.

```bash
# PowerShell: export the secrets for Compose
$env:APPWRITE_API_KEY="<server API key>"
$env:YOUPI_ADMIN_TOKEN="<shared admin token>"
$env:YOUPI_WEBHOOK_SECRET="<webhook secret>"
docker compose up --build
# frontend http://localhost:3000
# backend  http://localhost:4000/api/health
```

## API

- `GET /api/health`
- `GET /api/auth/setup` (public; whether first-run setup is needed)
- `POST /api/auth/setup` `{ name, email, password }` (public; only while no users exist)
- `POST /api/auth/login` `{ email, password }` → `{ token, user, permissions }`
- `GET /api/auth/me` (requires a session token)
- `POST /api/auth/logout`
- `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id` (admin only)
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
- `POST /api/payments/webhook` (YOUPI PG -> backend, HMAC-SHA256 verified)
- `GET /api/appwrite/status` (Appwrite connection and tables)
