#!/usr/bin/env bash
# Auto-deploy: pull from GitHub and restart exactly the services that changed.
# Runs every 5 minutes via /etc/cron.d/gundusss-deploy.
set -u
exec 9>/tmp/gundusss-deploy.lock
flock -n 9 || exit 0   # never overlap with a running deploy

cd /opt/gundusss
if ! git fetch origin main -q 2>/dev/null; then
  echo "fetch failed at $(date -Is) - will retry next cycle"
  exit 0
fi

NEW=$(git rev-parse origin/main)
# Track the last *deployed* revision, not HEAD: something else (a manual pull,
# a cron overlap) can advance HEAD without deploying, and comparing against
# HEAD would then silently skip the rebuild.
OLD=$(cat .last-deploy-rev 2>/dev/null || git rev-parse HEAD 2>/dev/null || echo none)
[ "$NEW" = "$OLD" ] && exit 0

echo "===== deploy $(date -Is): $OLD -> $NEW"
git diff --name-only "$OLD" "$NEW" > /tmp/git_changed_names 2>/dev/null || {
  git reset --hard origin/main
  exit 0
}
CHANGED=$(cat /tmp/git_changed_names)
git reset --hard origin/main

# --- fees backend (typescript -> dist/server.js, systemd: fees-backend)
if echo "$CHANGED" | grep -qE '^backend/(src/|package(-lock)?\.json|tsconfig)'; then
  echo "-- backend changed"
  if echo "$CHANGED" | grep -q '^backend/package-lock.json'; then
    echo "   installing backend deps..."
    (cd backend && npm ci --no-audit --no-fund >/dev/null 2>&1) || (cd backend && npm install --no-audit --no-fund)
  fi
  (cd backend && npx tsc) || { echo "!! backend build FAILED - keeping old dist"; exit 1; }
  systemctl restart fees-backend
  for i in $(seq 1 20); do
    if curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/health | grep -q '^200$'; then
      echo "   backend: healthy (attempt $i)"
      break
    fi
    sleep 1
  done
fi

# --- payment gateway (runs from source, no build, systemd: youpi-gateway)
if echo "$CHANGED" | grep -qE '^payment-gateway/'; then
  echo "-- gateway changed"
  if echo "$CHANGED" | grep -q '^payment-gateway/package-lock.json'; then
    echo "   installing gateway deps..."
    (cd payment-gateway && npm ci --no-audit --no-fund >/dev/null 2>&1) || (cd payment-gateway && npm install --no-audit --no-fund)
  fi
  systemctl restart youpi-gateway
  for i in $(seq 1 25); do
    if curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:6100/health | grep -q '^200$'; then
      echo "   gateway: healthy (attempt $i)"
      break
    fi
    sleep 1
  done
  echo "   gateway: $(systemctl is-active youpi-gateway)"
fi

# --- reminder queue worker (python, systemd: gundusss-worker)
if echo "$CHANGED" | grep -qE '^queue-worker/'; then
  echo "-- queue worker changed"
  (cd queue-worker && python3 -m pip install --break-system-packages -r requirements.txt --quiet >/dev/null 2>&1) || true
  systemctl restart gundusss-worker 2>/dev/null || true
  sleep 2
  echo "   worker: $(systemctl is-active gundusss-worker 2>/dev/null || echo not-installed)"
fi

echo "===== done"
# Record success only after both service steps completed, so a failed build is
# retried on the next cron cycle instead of being marked deployed.
echo "$NEW" > .last-deploy-rev
