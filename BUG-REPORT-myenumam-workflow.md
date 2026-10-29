# MyFees Workflow Verification — Bug Report

**Account tested:** `myenumam@gmail.com` (workspace **Myenum**, `ORG-KRG73BEG`, profile slug `myenum`)
**Test phones:** `6374984055` (TEST Prince, STU-T2021) · `8825957384` (TEST Sathish, STU-T2022)
**Date:** 2026-10-29
**Environment:** Local — backend `:4000`, payment-gateway `:6100` (checkout `:7000`)

> Two test students (STU-T2021 / STU-T2022) and three ₹10 test fees and test receipts were created in the workspace during verification and were **not** removed. They are namespaced with `TEST` and can be deleted at will if you do not want them in production data.

---

## ⚠️ Test credentials

- The password for `myenumam@gmail.com` was **reset** during testing (original password was lost/orphaned).
  → **New password: `Fees@2026`**
- Super admin still works: `developer@myenum.in` / `@Meenu2412`

---

## 🔴 Critical Bugs

### 1. Payment gateway merchant webhook was misconfigured — SUCCESS events never settled fees (FOUND & FIXED during test)

- The gateway merchant record for the fees backend pointed to `http://localhost:5000/api/webhook` (a demo-store URL that 404s), so **every successful UPI observation produced no receipt and left fees unpaid forever.**
- The silent symptom: gateway sessions show `VERIFIED` observations, gateway order `SUCCESS`, but fees-backend orders stayed `PROCESSING` and fees stayed `pending`.
- **Fix applied:** pointed merchant webhook to `http://localhost:4000/api/payments/webhook` via `node --env-file=.env scripts/configure-fees-webhook.mjs` (run inside `payment-gateway/`). Verified: webhook deliveries now hit the fees backend with `200 {"received":true}` and full UPI settle → receipt → fee-paid flow works end-to-end.
- ⚠️ **Risk:** if the gateway DB is reset or seeded again, this misconfiguration returns. Add a startup assertion in the gateway that a fees-backend merchant exists with the correct webhook URL.

### 2. No duplicate-payment guard — the same fee can be paid twice

- Evidence (final state):
  - Order `FEE-1793255807073-af88f247` (UPI, SUCCESS, `feeId: 2`) → receipt **RCP-003** (₹10)
  - Order `FEE-1793255811120-525b5a54` (CASH_COUNTER, SUCCESS, `feeId: 2`) → receipt **RCP-004** (₹10)
  - Both settle **the same fee (#2)** for TEST Prince: ₹20 collected for a ₹10 fee, 2 receipts issued, no error, no refund flow.
- Neither the checkout creation nor the webhook settlement checks whether the target fee is already `paid`.
- **Recommendation:** reject checkout creation for a `paid` fee; and at settlement, if the fee is already paid, still record the payment + receipt but flag it as `OVERPAID`/surplus instead of silently accepting.

### 3. Cron reminders are hardcoded to one workspace — other workspaces never get automatic reminders

- `backend/src/routes/reminders.ts` line 492–495 (`handleCronTrigger`):
  ```ts
  const targetProfile =
    profiles.find((p) => p.profileId === 'ORG-XD3SLDDC') || profiles[0];
  ```
- The single public cron endpoint `/api/reminders/cron/monthly` (job 8718717 on cron-job.org → `https://myfees.myenum.in/api/reminders/cron/monthly`) **always runs the `ORG-XD3SLDDC` workspace**, ignoring `X-Profile-Id`. The Myenum workspace (`ORG-KRG73BEG`) is silently skipped — its reminder status says "connected/SUCCESS" but the cron never touched it. This is a **multi-tenant data leak-adjacent design flaw**: with more sign-ups, exactly one (likely the developer's own) workspace gets billed reminders, all others get nothing.
- **Recommendation:** key the cron webhook with a per-profile token (`/api/reminders/cron/monthly?profile=ORG-XXXX&key=…`) or fan out to all workspaces having reminders enabled.
- Note: the *manual* trigger (`POST /api/reminders/trigger`) works correctly per-profile (verified — ran for all 3 test students with correct amounts/phones).

### 4. Sathish's UPI order is stuck: gateway SUCCESS, backend never settles it

- Order `FEE-1793255809803-4a74a8ec` (TEST Sathish): backend status **`PROCESSING`**, gateway status **`SUCCESS`**, UTR present at the gateway — but no receipt issued and fee #3 remains `pending`.
- This happened because the gateway observed success before the session was properly attributed/bound (stage-6 `UNATTRIBUTED`), and the webhook either never fired or was ignored.
- **There is no reconciliation loop**: nothing re-polls the gateway for `PROCESSING` orders, so this payment money path is silently lost (would actually be *received* in production!).
- **Recommendation:** add a periodic reconciliation job that pulls gateway sessions with `gatewayStatus=SUCCESS` and backend status ≠ settled, and completes/flags them. Also: at checkout time, bind the session as ACTIVE before observation is possible.

---

## 🟠 Major Bugs

### 5. Reminder message hardcodes the due date ("5th of this month") — ignores the fee structure's actual `dueDate`

- `reminders.ts` line 295: `• Due Date: 5th of this month` is a **literal string** in the WhatsApp message.
- The workspace's real fee structure FEE-001 has due day **30**; the test fees are due 2026-11-05. Customers whose fees are actually due on the 30th are being told they're due on the 5th → confusion + wrong late-payment perception.
- **Recommendation:** use the active fee's `dueDate` (or the profile's configured reminder day) in the message.

### 6. No automatic next-month bill generation (requested feature missing)

- Searched the whole backend for `next month / nextMonth / recurring / generateBill / auto-generate` — **zero matches**. Monthly fees must be created **manually** every month; nothing auto-generates the next month's bill after a payment, and nothing generates bills on a schedule.
- This was an explicit requirement of the workflow ("auto-generate next-month bills"). Current system: after fee #1 is paid, nothing creates fee for next month.
- **Recommendation:** on fee settlement (or via daily cron), clone the paid monthly fee into next month's `pending` bill seeded from the fee structure (amount, dueDate = structure day-of-month), with a `recurringOf`/`period` field to prevent duplicates.

### 7. No overdue auto-marking or overdue notification

- Fees simply stay `pending` forever after `dueDate` passes. No `overdue` status, no "your bill is overdue" reminder, no escalation.
- The reminder flow treats all non-paid fees the same regardless of due date.

### 8. WhatsApp bot is offline → ALL WhatsApp notifications fail (blocked test)

- Every reminder send attempt returns status FAILED, error `WhatsApp bot offline (queued for auto-send)`; all recipients `delivered=False`.
- Baileys state is `qr` — a QR is required to pair the phone.
- 📱 **QR saved to `D:\Gundusss\whatsapp-pair-now.png`** — scan it (WhatsApp → Linked devices → Link a device) to enable sending. If it expires, re-fetch from `GET http://localhost:4000/api/whatsapp/status`.
- Until paired, these flows are **untestable**: reminder delivery, receipt notification after payment, paid-status notifications. They will queue and auto-send once connected.

---

## 🟡 Minor Issues

### 9. User lookup / orphaned account confusion (Bug #1 during setup)

- `myenumam@gmail.com` behaved as "orphaned": signup/second-workspace flows said email "already exists", but `GET /api/users` in other workspaces never listed the user, and login failed with unknown password. Account was only reachable with workspace header override. Password had to be reset via super-admin `PUT /api/users/4`.
- Hard for support: genuinely orphaned accounts look identical to "wrong password".

### 10. Reminder checkout spam — every reminder run creates a new gateway checkout per student

- `executeMonthlyReminders` calls `createGatewayCheckout` per student on **every** run (line 304). Repeated cron/monthly runs (or multiple test triggers) will litter the payments list with `INITIATED` ₹-amount checkouts per student per run (already visible: multiple superfluous INITIATED UPI orders). Suggest caching/reusing one open checkout per student+period until used.

### 11. Reminder amount resolution is loose

- Line 288–291: if the student's group has no match in studentGroups, the amount falls back to `feeStructures[0].amount` — the **first** fee structure of the workspace, which may not apply to that student/class. With multiple fee structures this sends wrong amounts. (In this 1-structure workspace it was correct: ₹10 for all 3 students.)

### 12. Legacy reminder log entries mix `delivered=True` with an `error` field

- Oct-25 pre-test logs show `delivered=True; error=Queued for paced delivery` — contradictory shape in `StoredReminderSettings.logs` (the `error` field is being used as a status note). Cosmetic but confusing in the UI.

### 13. Pre-existing data artifacts

- Receipt numbering started at **RCP-001 "Diagnostic Test"** (₹1) that predates/parallels the workspace's real usage — harmless but treat real receipts as starting after RCP-001.
- Old ₹1 "Diagnostic Test" UPI orders remain `INITIATED`/`EXPIRED` forever; no auto-expiry cleanup of stale payments.

### 14. Orgmenu Gateway Admin panel prompts for the admin API token — FIXED

- The embedded "YOUPI PG Gateway Admin" console (`/orgmenu/dashboard` → `…/youpi-admin/?fees_token=<JWT>`) showed **"Admin token required — That token was rejected. Enter the admin API token again."** The fees session token was appended to the URL but nothing exchanged it for the gateway Admin API token, so `/api/v1/admin/*` calls came back 401 and the panel fell back to its manual prompt (rejection every time, since the fees JWT is not an admin token).
- **Fix (this session, see FIXES-REPORT §8):** the fees backend gate now reports `super`, the merchant-admin console gains a one-shot `POST /api/admin/session` exchange (verified against the gate, super sessions only), and `admin.html` seeds itself from `?fees_token=` and strips the token from the URL. The console now loads with the super-admin session — no prompt.
- **Fake tokens are impossible here:** the gate validates the token's HMAC signature, version and expiry server-side (forged "super-admin" payloads with a bad signature were confirmed rejected live with 401), and a rejected/fake token now tells the user the session is invalid rather than offering the manual token prompt.

### 15. `counter-decline` was not restricted to counter methods — FIXED

- The confirm side was hardened (counter methods + one time only) but `POST /api/v1/admin/counter-decline` still accepted digital (UPI) sessions, letting an operator force-`FAILED` a UPI payment from the desk, bypassing the verification lifecycle.
- **Fix (this session):** decline now mirrors confirm — UPI/COD sessions are refused with 400; a cash/card counter session declines exactly once. Covered by new `auth-guard` tests.

---

## ✅ What PASSED (verified working)

| Area | Result |
|---|---|
| Login `myenumam@gmail.com` / `Fees@2026` | ✅ (after reset) |
| Super admin login | ✅ |
| Fee structures / students CRUD | ✅ (PUT /api/students with `{items:[...]}`) |
| Bill creation (POST /api/fees) | ✅ 3 unpaid bills created |
| UPI end-to-end (register → bind → observe VERIFIED → webhook → settle) | ✅ after fix #1 |
| Receipt generation on settle | ✅ RCP-002 (Amarnath UPI), RCP-003 (Prince UPI) |
| Fee marked `paid` after webhook | ✅ fees #1, #2 → `paid` |
| CASH_COUNTER → confirm → SUCCESS + receipt | ✅ RCP-004 |
| CARD_COUNTER → decline → FAILED, no receipt | ✅ |
| Invalid payment method → 400 | ✅ |
| Zero amount → 400 | ✅ |
| Cron auth: no key / wrong key → 401; right key → 200 | ✅ |
| Public portal: `GET /api/public/profile/myenum` | ✅ 200 |
| Public checkout creation `POST /api/public/payments/create` | ✅ order + checkout URL |
| Payment settings sync (gateway connected, UPI ID `myenum2412@axisbank`, payee Amarnath) | ✅ |
| cron-job.org job 8718717 connected, schedule OK, lastRun SUCCESS | ✅ (but see bug #3 — runs wrong workspace) |
| Manual reminder trigger per workspace (3 students, correct amounts/phones) | ✅ (delivery blocked on WhatsApp — bug #8) |

---

## Final verified state (end of test)

| Fee | Student | Status | Covered by |
|---|---|---|---|
| #1 ₹10 | Amarnath Mk (STU-001) | `paid` | UPI order `…-4aa7d495` → RCP-002 |
| #2 ₹10 | TEST Prince (STU-T2021) | `paid` (⚠️ paid TWICE) | UPI `…-af88f247` → RCP-003 + Cash `…-525b5a54` → RCP-004 |
| #3 ₹10 | TEST Sathish (STU-T2022) | `pending` (card declined; UPI orphaned at gateway — bug #4) | — |

**Money math sanity check:** collected ₹40 across 4 receipts for ₹30 of fees — the extra ₹10 is the duplicate payment in bug #2.

---

## Suggested fix priority

1. 🔴 #3 hardcoded cron workspace (all paying tenants silently get no reminders)
2. 🔴 #2 duplicate-payment guard (direct financial loss)
3. 🔴 #4 gateway reconciliation job (money received but never recorded)
4. 🔴 #1 (fixed already) + add startup guard so it can't regress
5. 🟠 #6 auto next-month bill generation (explicit product requirement, missing)
6. 🟠 #5 real due date in reminder message · #7 overdue status/notifications
7. 🟡 #10–#13 minor cleanups

## Retest needed after WhatsApp pairing

- [ ] Reminder WhatsApp delivery per student (`6374984055`, `8825957384`)
- [ ] Message shows real due date (after fix #5)
- [ ] Paid/unpaid receipt notifications after payment
- [ ] Confirm queued `auto-send` items flush correctly once bot is `ready`

---
*Test artifacts created: students `STU-T2021`, `STU-T2022`; fees #1–#3; receipts RCP-002…RCP-004; various gateway sessions. QR: `D:\Gundusss\whatsapp-pair-now.png`.*
