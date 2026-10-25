#!/usr/bin/env bash
# Auto-deploy: pull from GitHub and restart exactly the services that changed.
# Runs every 5 minutes via /etc/cron.d/gundusss-deploy.
set -u
exec 9>/tmp/gundusss-deploy.lock
flock -n 9 || exit 0   # never overlap with a running deploy

cd /opt/gundusss
git fetch origin main -q 2>/dev/null || exit 0

NEW=$(git rev-parse origin/main)
OLD=$(git rev-parse HEAD 2>/dev/null || echo none)
[ "$NEW" = "$OLD" ] && exit 0

echo "===== deploy $(date -Is): $OLD -> $NEW"
git diff --name-only "$OLD" "$NEW" > /tmp/git_changed_names 2>/dev/null || {
  git checkout -B main origin/main -q
  exit 0
}
CHANGED=$(cat /tmp/git_changed_names)
git checkout -B main origin/main -q

# --- fees backend (typescript -> dist/server.js, systemd: fees-backend)
if echo "$CHANGED" | grep -qE '^backend/(src/|package(-lock)?\.json|tsconfig)'; then
  echo "-- backend changed"
  if echo "$CHANGED" | grep -q '^backend/package-lock.json'; then
    echo "   installing backend deps..."
    (cd backend && npm ci --no-audit --no-fund >/dev/null 2>&1) || (cd backend && npm install --no-audit --no-fund)
  fi
  (cd backend && npx tsc) || { echo "!! backend build FAILED - keeping old dist"; exit 1; }
  systemctl restart fees-backend
  sleep 4
  echo "   health: $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/api/health)"
fi

# --- payment gateway (runs from source, no build, systemd: youpi-gateway)
if echo "$CHANGED" | grep -qE '^payment-gateway/'; then
  echo "-- gateway changed"
  if echo "$CHANGED" | grep -q '^payment-gateway/package-lock.json'; then
    echo "   installing gateway deps..."
    (cd payment-gateway && npm ci --no-audit --no-fund >/dev/null 2>&1) || (cd payment-gateway && npm install --no-audit --no-fund)
  fi
  systemctl restart youpi-gateway
  sleep 3
  echo "   gateway: $(systemctl is-active youpi-gateway)"
fi

echo "===== done"
