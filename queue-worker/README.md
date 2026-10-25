# MyFees Reminder Queue Worker

Independent Python worker that paces reminder delivery with randomized
anti-ban spacing, deliberately separated from the Node backend so a slow
WhatsApp run can never block or crash the API.

## How it connects

- Backend (Baileys engine, no browser) keeps a durable job queue at
  `backend/.queue/queue.json` (`POST /api/queue/claim|send|result`, protected
  by the `X-Worker-Key` header).
- The monthly cron / "Run Reminder Now" enqueue a job and return instantly
  with status `QUEUED`; the worker delivers and merges results back into the
  run log.
- If WhatsApp disconnects mid-run, the worker *releases* the job back to
  pending instead of losing it.

## Setup (server)

```bash
cd /opt/gundusss/queue-worker
pip install --break-system-packages -r requirements.txt   # requests, python-dotenv
cp .env.example .env    # then set WORKER_SECRET matching backend/.env
python3 -u worker.py    # or run as a systemd service (gundusss-worker)
```

Tunables live in `.env`: `SEND_GAP_SECONDS`, `SEND_JITTER_SECONDS`, `POLL_SECONDS`.
