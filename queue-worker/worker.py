#!/usr/bin/env python3
"""
MyFees reminder queue worker.

Runs independently of the Node backend. Every POLL_SECONDS it asks the API for
a queued reminder job and delivers it one message at a time through the
Baileys engine, with a randomized anti-ban spacing between messages.

Flow
----
1. POST /api/queue/claim          -> next job (or {"job": null})
2. for each item:
      POST /api/queue/send        -> Baileys send (backend paces again as a
                                     final safety net)
      sleep SEND_GAP_SECONDS + random*SEND_JITTER_SECONDS
3. POST /api/queue/result         -> per-recipient outcomes (or release=true
                                     when the engine was offline, so the job
                                     is retried later instead of being lost)

Auth: every request carries the X-Worker-Key header (WORKER_SECRET shared with
the backend .env). Failed HTTP calls are retried with backoff so transient
backend restarts never lose a job.
"""
import os
import random
import sys
import time

import requests
from dotenv import load_dotenv

load_dotenv()

API_BASE = os.getenv("API_BASE", "http://127.0.0.1:4000").rstrip("/")
WORKER_SECRET = os.getenv("WORKER_SECRET", "").strip()
SEND_GAP_SECONDS = float(os.getenv("SEND_GAP_SECONDS", "12"))
SEND_JITTER_SECONDS = float(os.getenv("SEND_JITTER_SECONDS", "8"))
POLL_SECONDS = float(os.getenv("POLL_SECONDS", "10"))
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT_SECONDS", "65"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "5"))

HEADERS = {"X-Worker-Key": WORKER_SECRET, "Content-Type": "application/json"}


def log(msg: str) -> None:
    print(f"[{time.strftime('%Y-%m-%dT%H:%M:%S')}] {msg}", flush=True)


def post(path: str, payload: dict | None = None) -> dict | None:
    """POST with retries; returns parsed JSON or None on permanent failure."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            res = requests.post(
                f"{API_BASE}{path}",
                json=payload if payload is not None else {},
                headers=HEADERS,
                timeout=HTTP_TIMEOUT,
            )
            if res.status_code in (401, 403, 503):
                log(f"{path} -> {res.status_code} (fatal auth/config)")
                return None
            body = {}
            try:
                body = res.json()
            except Exception:
                body = {}
            # HTTP-level failure but body may still carry partial data
            return {"status": res.status_code, **body}
        except requests.RequestException as exc:
            wait = min(60, 2**attempt)
            log(f"{path} network error ({exc!r}); retry in {wait}s")
            time.sleep(wait)
    return None


def claim_job():
    body = post("/api/queue/claim")
    if not body:
        return None
    return (body.get("data") or {}).get("job")


def send_one(phone: str, message: str, cta=None):
    payload = {"phone": phone, "message": message}
    if cta and isinstance(cta, dict) and cta.get("url"):
        payload["ctaUrl"] = {
            "displayText": str(cta.get("displayText") or "Open Link"),
            "url": str(cta.get("url")),
        }
    body = post("/api/queue/send", payload)
    if not body:
        return False, "backend unreachable", False  # delivered, error, retain
    data = body.get("data") or {}
    if body.get("status") == 409 or not data.get("delivered"):
        # 409 => engine not ready: release the whole job for a later retry.
        return False, body.get("error") or "send failed", body.get("status") == 409
    return True, None, False


def finish(job_id: str, profile_id: str, results: list, release: bool):
    payload = {"jobId": job_id, "profileId": profile_id, "results": results}
    if release:
        payload["release"] = True
    post("/api/queue/result", payload)


def process_job(job: dict) -> None:
    job_id = job.get("jobId", "unknown")
    profile_id = job.get("profileId", "")
    items = job.get("items") or []
    log(f"job {job_id}: delivering {len(items)} message(s)")

    results = []
    for idx, item in enumerate(items):
        phone = str(item.get("phone", "")).strip()
        message = str(item.get("message", ""))
        if not phone:
            results.append({"phone": "", "delivered": False, "error": "missing phone"})
            continue

        delivered, error, release_now = send_one(
            phone, message, item.get("ctaUrl")
        )

        # Double protection against a half-way job: if the engine dropped
        # mid-run, release everything back so nothing is silently skipped.
        if release_now:
            log(f"job {job_id}: engine offline at item {idx + 1}; releasing back to queue")
            finish(job_id, profile_id, results, release=True)
            return

        results.append(
            {
                "phone": phone,
                "studentId": item.get("studentId"),
                "delivered": delivered,
                "error": error,
            }
        )
        log(f"job {job_id}: item {idx + 1}/{len(items)} -> {phone}: "
            f"{'delivered' if delivered else f'FAILED ({error})'}")

        if idx < len(items) - 1:
            # Randomized spacing between messages (anti-ban).
            pause = SEND_GAP_SECONDS + random.random() * SEND_JITTER_SECONDS
            log(f"job {job_id}: pacing {pause:.1f}s before next message")
            time.sleep(pause)

    finish(job_id, profile_id, results, release=False)
    ok = sum(1 for r in results if r.get("delivered"))
    log(f"job {job_id}: finished — {ok}/{len(items)} delivered")


def main() -> None:
    if not WORKER_SECRET:
        log("WORKER_SECRET is not set; refusing to start")
        sys.exit(1)
    log(f"worker started -> api {API_BASE} (gap {SEND_GAP_SECONDS}s + 0-{SEND_JITTER_SECONDS}s jitter)")
    while True:
        try:
            job = claim_job()
            if job:
                process_job(job)
                continue  # check for the next job immediately
        except Exception as exc:  # never die on one bad cycle
            log(f"unexpected error: {exc!r}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
