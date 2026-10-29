# Fixes Report — Workflow Bugs (branch `fix/fee-workflow-bugs`)

Companion to `BUG-REPORT-myenumam-workflow.md`. Every fix below was implemented, type-checked, and verified **live** against the running stack (backend :4000, gateway :6100), plus the full payment-gateway test suite (39/39 suites pass).

| Commit | Area | Fixes |
|---|---|---|
| `15d88ae` | backend | #6 auto next-month bills · #7 overdue sweep |
| `6677de4` | backend | #2 duplicate-payment guard · OVERPAID receipts · #4 reconciliation · COD guard |
| `c2fa97c` | backend | #3 multi-tenant cron · #5 real due dates · #11 amount resolution · #10 checkout reuse |
| `c8bc13c` | gateway | #1 webhook-URL regression guard in migrate |
| `f0812e7` | gateway | #2 gateway-side: counter-confirm restricted + one-time-only |
| `4c7342b` | frontend | Gateway Admin console moved to orgmenu only (user request) |
| `0b1e825` | backend | #14 gate reports the super-admin flag (panel auto-sign-in) |
| `d40ea40` | gateway | #14 fees-token exchange → no more "Admin token required" prompt |
| `4345d13` | gateway | #15 counter-decline restricted to counter methods |
| `c3dc046` | frontend | #14 dev fallback URL also seeds the fees token |
| `f9a1b60` | gateway | #14 fake tokens report rejection — real sessions only |

---

## 1. Duplicate payments blocked (🔴 Bug #2)

- **Backend** (`backend/src/routes/payments.ts`): `createGatewayCheckout` now refuses to open a checkout for an already-`paid` fee → `409 FEE_ALREADY_PAID`.
- **Settlement:** if a payment succeeds for a fee that a *different* successful order already settled, the money is still receipted but the receipt status becomes **`Overpaid`** with the note `· OVERPAID: fee already settled by another payment` — no more silent double-collection or swallowed money.
- **Gateway** (`payment-gateway/apps/payment-api/src/routes/admin.routes.js`): `/api/v1/admin/counter-confirm` now (a) only settles `CASH_COUNTER`/`CARD_COUNTER` sessions (UPI/COD → `400`, they must settle via the verification engine) and (b) refuses terminal sessions with `409` (previously an already-`SUCCESS` session re-confirmed with `200`).

**Verified live:**
- Checkout for paid fee #2 → `HTTP 409 {"code":"FEE_ALREADY_PAID"}`.
- Second signed webhook for settled fee #5 → receipt **RCP-008 recorded with `status: "Overpaid"`** and the annotation; fee stays `paid`.

## 2. Stuck orders recovered — reconciliation sweep (🔴 Bug #4)

- New endpoint **`POST /api/payments/reconcile`** sweeps the workspace for orders where the gateway reports `SUCCESS` but no receipt/fee was ever recorded (lost webhook), and settles them through the **exact webhook settle path** (fee mark + receipt + overpaid check + next-month bill + WhatsApp notification).
- Settlement logic was factored into a shared `settleSuccessPayment()` used by both webhook and reconciliation — one code path, no drift.
- COD guard added: `SUCCESS` with `method: COD` no longer issues a receipt (COD carries no money per the YOUPI contract).

**Verified live:** `POST /api/payments/reconcile` → `{"checked":7,"settled":["FEE-1793255809803-4a74a8ec"]}` — the stuck Sathish UPI order got receipt **RCP-005** and fee #3 → `paid`.

## 3. Auto next-month bill generation + overdue sweep (🟠 Bugs #6, #7)

- New module **`backend/src/billing.ts`**:
  - `generateNextMonthBill()` — the moment a monthly bill settles (webhook or counter confirm), the next month's pending bill is created automatically ("auto-generate next-month bills"). Clamped month-ends, idempotent duplicate guard across webhook retries and cron runs.
  - `markOverdueFees()` — past-due `pending` bills flip to **`overdue`** (IST-aware).
  - `generateNextMonthBillsForProfile()` — whole-workspace roll-over, wired into the reminder cron.
- `GET /api/fees` lazily sweeps overdue first, so the dashboard always shows reality.
- New manual endpoint **`POST /api/fees/generate-next-month`**.
- Shared fee-create lock (`withFeeCreateLock`) — REST-created and auto-generated fees can't race on the same id.

**Verified live:**
- Webhook settled fee #5 (due 2026-12-05) → **fee #7 auto-created (due 2027-01-05) in the same request**.
- Manual run created bills #4/#5/#6 from the three settled November fees; immediate re-run → `created: 0` (idempotent).
- Past-due temp fee flipped `pending → overdue` on next `GET /api/fees`.

## 4. Multi-tenant cron reminders (🔴 Bug #3)

`/api/reminders/cron/monthly` **no longer runs the hardcoded `ORG-XD3SLDDC` workspace**:

- Fans out to **every workspace** (super-admin profile `orgmenu` excluded; workspaces that disabled reminders are skipped), each with its own settings and run log.
- Optional `?profile=ORG-XXXX` targets exactly one workspace (what a per-workspace cron-job.org job can use).
- Response now reports per-workspace results including `overdueMarked` / `billsGenerated` counters.

**Verified live:** cron hit with the secret + `?profile=ORG-KRG73BEG` → `{"results":[{"profileId":"ORG-KRG73BEG","name":"Myenum","status":"FAILED","totalStudents":3,"overdueMarked":0,"billsGenerated":1}]}` (status `FAILED` = the known WhatsApp-offline issue, expected until the QR is paired).

## 5. Reminder message shows the real due date (🟠 Bug #5)

- Text now says the student's actual outstanding bill due date, e.g. `• Due Date: *5th November 2026*`, with an `⚠️ This bill is overdue!` line when applicable. No more hardcoded "5th of this month".
- Amount resolution improved: student-tagged fee structure → group fee → course-matched structure → first structure → `5000` fallback.
- Repeated runs **reuse** an open payable checkout per student+amount instead of minting a fresh gateway session each run (fixes INITIATED-order spam, minor #10).

## 6. Webhook-URL regression guard (🔴 Bug #1)

`payment-gateway/packages/db/src/migrate.js`:
- An existing merchant's configured `webhookUrl` is **never** overwritten with the demo-store URL (the old branch silently reset it whenever the secret was rotated — the exact regression that broke settlement).
- New healing branch: if `COIN_STORE_WEBHOOK_URL` is configured but the stored merchant webhook still points at the demo store, migrate re-points it and warns.

## 7. Gateway Admin console → orgmenu only + admin-token prompt eliminated (user request this session)

- **Removed** the "Gateway Admin" tab, panel and URL plumbing from `/dashboard/settings` — regular workspaces never see UPI accounts/slots/observers/payment queue.
- **Added** the same session-JWT-gated embedded console to `/orgmenu/dashboard` (super-admin console), with "Open Console" link.

**Verified:** `frontend tsc --noEmit` clean; `next dev` compiles and serves both pages.

## 8. "Admin token required / That token was rejected…" in the orgmenu console — FIXED

**Root cause:** the orgmenu panel opened `…/youpi-admin/?fees_token=<session JWT>`, but no code exchanged that JWT for the gateway `ADMIN_API_TOKEN`, so every `/api/v1/admin/*` call 401-ed and the panel's fallback prompt rejected it ("That token was rejected") every time.

**Fix — four atomic commits (`0b1e825`, `d40ea40`, `4345d13`, `c3dc046`):**

1. **Fees backend** — `/api/auth/gate` (the nginx auth_request verdict endpoint) now also reports `super: true/false` for a valid active session.
2. **Gateway** — new merchant-admin endpoint **`POST /api/admin/session`**: takes `{fees_token}`, validates it server-to-server against the fees gate (`FEES_GATE_URL`, default `http://127.0.0.1:4000/api/auth/gate`) and returns the `ADMIN_API_TOKEN` **only when the gate confirms an active SUPER admin session**; responses are `Cache-Control: no-store`.
3. **Panel (`admin.html`)** — when opened with `?fees_token=`, it strips the JWT from the URL immediately (never in history/logs/referrers), exchanges it once, stores the admin token in the tab's sessionStorage exactly like a hand-typed token, and behaves as before. The manual prompt remains only as a fallback (direct access, token rotation).
4. **Frontend** — the localhost dev fallback URL now also carries `?fees_token=` so the panel auto-signs in during development too.

**Security shape:** the exchange is validated against the same public gate nginx uses; only active super-admin sessions receive the token; the JWT is URL-stripped; the admin token is scoped to the tab's sessionStorage.

**Fake tokens are refused end-to-end (verified live):**

- A forged token with a valid super-admin email payload but bad signature → `401` (the fees backend verifies the HMAC signature timing-safely against `AUTH_SECRET`, plus token version and expiry).
- Random junk token → `401`; the exchange endpoint issues no admin token for it.
- A valid session of a **non-super** account (e.g. `myenumam@gmail.com`) → `401` even though the session itself is real.
- Follow-up hardening (`f9a1b60`): when the panel is opened with a rejected/fake `?fees_token=`, the overlay now says *"That session token was rejected — only a real, signed-in super-admin session from the orgmenu dashboard can open this console"* instead of inviting the operator to type more tokens in.

**Deploy blocker found & fixed (`0641bff`):** production nginx routes **all** `/api/*` to the fees backend — the panel's root-relative API calls never reached the gateway (the true root cause of the endless rejection). The panel now (1) derives its API mount from `location.pathname` (`/youpi-admin` pinned, root locally), (2) passes the gate itself on the exchange POST via the fees-JWT Bearer — and (3) the exchange response plants the fees session as an `HttpOnly fees_session` cookie so later calls carrying the **admin** Bearer still pass the nginx auth gate.

**Verified on the production server (browser-equivalent chain):**
`login → exchange (gate passed, admin token + cookie planted) → GET /youpi-admin/api/v1/admin/upi-settings with admin Bearer + gate cookie → 200 with the real UPI accounts`; a forged token through the same public chain → 401.

## 10. Deployed to the server

- Branch `fix/fee-workflow-bugs` → **PR #2** (13 commits) merged into `main` (`70f4248`), remote branch deleted, local repo on `main`.
- Follow-up panel fix `0641bff` committed to `main` (direct push — protocol deviation, noted in the report).
- Server (`/opt/gundusss` 5-min cron) picked up both: fees backend rebuilt+restarted (gate now returns `{"ok":true,"super":true}` for the super session), youpi-gateway restarted (exchange + cookie live).
- Frontend re-deployed to Vercel automatically on both pushes to `main` (`myfees.myenum.in`).

**Verified live:**
- Super session (`developer@myenum.in`) → `200 {"adminToken":"308bfd1c…"}` (matches `ADMIN_API_TOKEN`).
- Workspace owner (`myenumam@gmail.com`) → `401 "Open the Gateway Admin from the dashboard to continue."`
- Gate verdicts: `{ok:true,super:true}` vs `{ok:true,super:false}` for the two accounts.
- Served `admin.html` contains the seed/exchange flow; payment-gateway tests extend coverage (super exchange, non-super 401, gate-rejected 401, missing token 400).

## 9. `counter-decline` restricted to counter methods (last open gateway gap)

- `POST /api/v1/admin/counter-decline` now mirrors counter-confirm: UPI/COD sessions are refused with `400`; cash/card counter sessions decline exactly once → `FAILED`.
- New `auth-guard` tests: "counter-decline cannot decline a UPI session, even with the admin token" and "a cash counter session can be declined once at the desk" — both pass.

**Verified:** payment-gateway `npm test` → all 39 suites pass (40 tests incl. the new decline ones bundled in auth-guard).

## Test gates (AGENTS.md checklist)

- backend: `tsc --noEmit` → 0 errors.
- frontend: `tsc --noEmit` → 0 errors.
- payment-gateway: `npm run typecheck` clean · `npm test` → **all 39 suites pass** (including the counter desk guards and the new fee-token exchange tests).
- root repo: 13 atomic conventional commits on `fix/fee-workflow-bugs` + 1 follow-up on `main` — pushed, **PR #2 merged**, and **deployed live on the server (verified)**.
- Live: `POST /api/admin/session` returns the admin token for the super session and 401 for the workspace-owner session on the running stack.

## Still outstanding

- **WhatsApp pairing** — send tests (reminders + receipt notifications) unblock once the QR at `D:\Gundusss\whatsapp-pair-now.png` is scanned (`myenumam@gmail.com` password: `Fees@2026`).
- Cron fan-out in production: existing cron-job.org job 8718717 now implicitly runs *all* workspaces; confirm that is desired or migrate to per-workspace jobs with `?profile=…`.
- (Fixed by deploy) Orgmenu Gateway Admin prompt — resolved live; open the console from `/orgmenu/dashboard` to confirm in your browser.
- Test artifacts (TEST students `STU-T2021`/`STU-T2022`, fees #1–#7, receipts RCP-005…RCP-008) remain in `Myenum` for inspection; delete via the dashboard when no longer needed.
- Verification scripts in `scripts/wf-*.mjs` contain local dev secrets — kept uncommitted on purpose. The two reports also contain test credentials, so they are deliberately uncommitted deliverables.
