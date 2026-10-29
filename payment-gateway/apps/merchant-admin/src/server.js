import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase, MerchantRepository, SupportTicketRepository } from '@youpi/db';
import { getAdminToken, safeEqual } from '@youpi/common';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Security headers applied to every response served by the merchant admin. */
const BASE_SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'"
});

/** True when the caller presented the admin bearer token in constant time (or ?token= on GET SSE). */
function hasAdminToken(req, url = null, pathname = '') {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers?.['authorization'] || '');
  if (match) {
    return safeEqual(match[1].trim(), getAdminToken());
  }
  // NOTE: the stream token is deliberately NOT accepted from a query parameter. A
  // credential in the URL ends up in access logs, browser history and Referer headers.
  // The dashboards now open the stream with fetch() so the token travels in the
  // Authorization header only.
  return false;
}

/**
 * Strips headers a browser must not be able to spoof when relaying to an internal service.
 */
function sanitizedForwardHeaders(req, targetHost) {
  const headers = { ...req.headers, host: targetHost };
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase();
    if (lower === 'x-internal-render' || lower === 'x-internal-token') {
      delete headers[name];
    }
  }
  return headers;
}

// In production, reliably ensure environment variables from .env are loaded if not already provided
if (!process.env.BASE_PAYMENT_API_URL && typeof process.loadEnvFile === 'function') {
  try {
    const rootEnv = path.resolve(__dirname, '../../../.env');
    if (fs.existsSync(rootEnv)) {
      process.loadEnvFile(rootEnv);
    }
  } catch {}
}

/**
 * Validates a fees dashboard session token against the fees backend's public
 * gate endpoint (the same endpoint the nginx auth_request uses). Resolves the
 * gate verdict ({ ok, super }), or null when the fees backend is unreachable.
 */
function verifyFeesSession(feesGateUrl, token) {
  return new Promise((resolve) => {
    let gate;
    try {
      gate = new URL(feesGateUrl);
    } catch {
      resolve(null);
      return;
    }
    const transport = gate.protocol === 'https:' ? https : http;
    const req = transport.request({
      hostname: gate.hostname,
      port: gate.port || (gate.protocol === 'https:' ? 443 : 80),
      path: `${gate.pathname}${gate.search}`,
      method: 'GET',
      timeout: 5000,
      headers: { 'x-fees-arg': token }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('fees gate timeout')));
    req.on('error', () => resolve(null));
    req.end();
  });
}

export class AdminServer {
  /**
   * @param {{
   *   db?: import('@youpi/db').Database,
   *   apiBaseUrl?: string
   * }} options
   */
  constructor(options = {}) {
    this.db = options.db || getDatabase();
    this.apiBaseUrl = options.apiBaseUrl || process.env.BASE_PAYMENT_API_URL || 'http://localhost:6100';
    // Fees backend gate used by POST /api/admin/session to validate a fees
    // dashboard session token (same endpoint nginx auth_request uses).
    this.feesGateUrl = options.feesGateUrl || process.env.FEES_GATE_URL || 'http://127.0.0.1:4000/api/auth/gate';
    this.merchantRepo = new MerchantRepository(this.db);
    this.ticketRepo = new SupportTicketRepository(this.db);
    this.htmlTemplatePath = path.join(__dirname, 'views', 'admin.html');
    this.template = fs.readFileSync(this.htmlTemplatePath, 'utf8');
  }

  renderHtml() {
    try {
      this.template = fs.readFileSync(this.htmlTemplatePath, 'utf8');
    } catch {}

    let html = this.template;
    // Always use empty string '' so client fetch calls hit the merchant admin's own /api proxy!
    // This completely eliminates CORS errors, tunnel downtime 530s, and cross-origin failures.
    const clientApiBase = '';
    html = html.replaceAll('{{API_BASE_URL}}', clientApiBase);
    return html;
  }

  createServer() {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
      }

      // Health
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'UP', service: 'merchant-admin' }));
        return;
      }

      // Admin Tickets API: GET /api/admin/tickets
      if (pathname === '/api/admin/tickets') {
        if (!hasAdminToken(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }));
          return;
        }
        const merchants = this.merchantRepo.findAll();
        const mId = merchants[0]?.id || '00000000-0000-0000-0000-000000000001';
        const tickets = this.ticketRepo.findTicketsByMerchant(mId);

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...BASE_SECURITY_HEADERS
        });
        res.end(JSON.stringify(tickets));
        return;
      }

      // POST /api/admin/session — one-shot credential exchange for the embedded
      // fees-dashboard console. The dashboard opens this panel as
      // .../youpi-admin/?fees_token=<session JWT>; nginx auth_request already
      // gated the page load, but the fees JWT itself cannot authorize
      // /api/v1/admin/* (those need the gateway admin token). Instead of
      // prompting the operator, the panel calls this once with its fees_token;
      // we re-validate with the fees backend's gate and hand out the admin
      // token ONLY when the session belongs to an active SUPER admin. Never
      // cached, and the panel strips the JWT from its URL immediately.
      if (pathname === '/api/admin/session') {
        let raw = '';
        req.on('data', (chunk) => { raw += chunk; if (raw.length > 16384) req.destroy(); });
        req.on('end', async () => {
          if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST', 'Cache-Control': 'no-store', ...BASE_SECURITY_HEADERS });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }
          let body = null;
          try { body = JSON.parse(raw || '{}'); } catch {}
          const feesToken = String((body && body.fees_token) || '').trim();
          if (!feesToken) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...BASE_SECURITY_HEADERS });
            res.end(JSON.stringify({ error: 'fees_token required' }));
            return;
          }
          const verdict = await verifyFeesSession(this.feesGateUrl, feesToken);
          if (!verdict) {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...BASE_SECURITY_HEADERS });
            res.end(JSON.stringify({ error: 'Could not verify the session. Try again.' }));
            return;
          }
          if (!verdict.ok || verdict.super !== true) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...BASE_SECURITY_HEADERS });
            res.end(JSON.stringify({ error: 'Open the Gateway Admin from the dashboard to continue.' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...BASE_SECURITY_HEADERS });
          res.end(JSON.stringify({ adminToken: getAdminToken() }));
        });
        return;
      }

      // Merged Control Center Supervisor Proxy: /api/services/* and /api/logs/stream -> Control Center on port 8090
      // Relaying this unauthenticated would republish process control and every service's
      // stdout/stderr on the internet-facing admin host, so the admin token is required.
      if (pathname.startsWith('/api/services') || pathname === '/api/logs/stream') {
        if (!hasAdminToken(req, url, pathname)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }));
          return;
        }
        const ccPort = Number(process.env.CONTROL_CENTER_PORT || 8090);
        const forwardHeaders = sanitizedForwardHeaders(req, `localhost:${ccPort}`);
        if (!forwardHeaders.authorization && !forwardHeaders.Authorization) {
          forwardHeaders.Authorization = `Bearer ${getAdminToken()}`;
        }
        const proxyReq = http.request({
          hostname: '127.0.0.1',
          port: ccPort,
          path: req.url,
          method: req.method,
          headers: forwardHeaders
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Control center supervisor unavailable', details: err.message }));
          }
        });

        req.on('data', chunk => proxyReq.write(chunk));
        req.on('end', () => proxyReq.end());
        return;
      }

      // Transparent API Proxy: /api/* -> Payment Core REST API
      if (pathname.startsWith('/api/')) {
        const targetPort = Number(process.env.PAYMENT_API_PORT || 6100);
        const defaultMerchant = this.merchantRepo.getDefault ? this.merchantRepo.getDefault() : (this.merchantRepo.findById('00000000-0000-0000-0000-000000000001') || this.merchantRepo.findAll()[0]);
        const defaultMerchantId = defaultMerchant?.id || '00000000-0000-0000-0000-000000000001';
        const proxyReq = http.request({
          hostname: '127.0.0.1',
          port: targetPort,
          path: req.url,
          method: req.method,
          headers: {
            ...sanitizedForwardHeaders(req, `localhost:${targetPort}`),
            'x-merchant-id': req.headers['x-merchant-id'] || defaultMerchantId,
            'x-forwarded-host': req.headers.host || '',
            'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'http'
          }
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Gateway API unavailable', details: err.message }));
          }
        });

        req.pipe(proxyReq);
        return;
      }

      // Download Android Companion APK
      if (pathname === '/youpi-sms-gateway.apk' || pathname === '/api/v1/admin/sms-gateway/download-apk') {
        const apkCandidates = [
          path.resolve(__dirname, '../public/youpi-sms-gateway.apk'),
          path.resolve(__dirname, '../../payment-api/public/youpi-sms-gateway.apk'),
          path.resolve(__dirname, '../../android-observer-app/youpi-sms-gateway.apk')
        ];
        let apkPath = null;
        for (const p of apkCandidates) {
          if (fs.existsSync(p)) {
            apkPath = p;
            break;
          }
        }
        if (apkPath) {
          const stat = fs.statSync(apkPath);
          res.writeHead(200, {
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Disposition': 'attachment; filename="youpi-sms-gateway.apk"',
            'Content-Length': stat.size,
            'Access-Control-Allow-Origin': '*'
          });
          const stream = fs.createReadStream(apkPath);
          stream.pipe(res);
          return;
        }
      }

      // Self-hosted UI fonts (CSP blocks third-party font CDNs)
      const fontMatch = /^\/fonts\/(dm-sans|sora)\.woff2$/.exec(pathname);
      if (fontMatch && req.method === 'GET') {
        const fontPath = path.resolve(__dirname, '../public/fonts', `${fontMatch[1]}.woff2`);
        if (fs.existsSync(fontPath)) {
          res.writeHead(200, {
            'Content-Type': 'font/woff2',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff'
          });
          fs.createReadStream(fontPath).pipe(res);
          return;
        }
      }

      // Dashboard View: GET / or GET /admin
      if (pathname === '/' || pathname === '/admin') {
        const html = this.renderHtml();
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...BASE_SECURITY_HEADERS
        });
        res.end(html);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Admin Route Not Found');
    });
  }
}
