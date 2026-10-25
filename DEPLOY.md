# Deployment

The server auto-updates itself from `main` on GitHub:

- `/opt/gundusss` is a git checkout of this repo (public, so the server fetches anonymously).
- `/opt/gundusss/deploy.sh` runs every 5 minutes via `/etc/cron.d/gundusss-deploy`.
- On a new commit it: re-checks out `main`, rebuilds the backend (`npx tsc`) **only**
  when `backend/` changed, installs deps **only** when a package-lock changed, and
  restarts exactly the touched services (`fees-backend`, `youpi-gateway`).
- Runtime state on the server is gitignored and never touched by deploys:
  `backend/.env`, `payment-gateway/.env`, `node_modules/`, `dist/`, `.wwebjs_auth`.
- Logs: `/var/log/gundusss-deploy.log`. Build failure = keep old `dist` and exit 1.

Frontend is served from Vercel (`myfees.myenum.in`) and deploys automatically on
every push to `main`; nginx config lives in `/etc/nginx/sites-available/gundusss.conf`
(not in the repo — it contains the gateway admin gate).
