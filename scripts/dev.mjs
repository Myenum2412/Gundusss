#!/usr/bin/env node
/**
 * Single-terminal dev runner.
 *
 * Starts the Fastify backend, waits until it answers /api/health, then starts
 * Next.js (and the YOUPI gateway when it is installed). All logs are streamed
 * into one terminal with per-service prefixes. Ctrl+C stops every child.
 *
 * Usage:
 *   node scripts/dev.mjs                 # backend + frontend + gateway
 *   node scripts/dev.mjs --no-gateway    # backend + frontend
 *   node scripts/dev.mjs --with-gateway  # fail if the gateway is not installed
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const tag = (name, color) => paint(color, `[${name}]`.padEnd(10));

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT ?? 3000);
const BACKEND_READY_TIMEOUT_MS = Number(process.env.BACKEND_READY_TIMEOUT_MS ?? 90_000);

const args = new Set(process.argv.slice(2));
const gatewayRequested = args.has("--with-gateway");
const gatewayDisabled = args.has("--no-gateway");

const children = new Map();
let shuttingDown = false;

/* ------------------------------------------------------------------ output */

function prefixStream(name, color, stream, target) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) target.write(`${tag(name, color)} ${line}\n`);
  });
  stream.on("end", () => {
    const rest = buffer.trimEnd();
    if (rest) target.write(`${tag(name, color)} ${rest}\n`);
    buffer = "";
  });
}

/* --------------------------------------------------------------- processes */

function killTree(child) {
  if (!child.pid || child.killed) return;
  if (isWindows) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

function startTask(name, color, command, commandArgs, { optional = false } = {}) {
  const options = {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
    stdio: ["ignore", "pipe", "pipe"],
  };

  // Windows cannot spawn npm.cmd without a shell, so pass one command line.
  // Elsewhere keep the argv array so nothing needs escaping.
  const child = isWindows
    ? spawn(
        [command, ...commandArgs]
          .map((part) => (/[\s"]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part))
          .join(" "),
        { ...options, shell: true, windowsHide: true }
      )
    : spawn(command, commandArgs, { ...options, detached: true });

  children.set(child, { name, optional });
  prefixStream(name, color, child.stdout, process.stdout);
  prefixStream(name, color, child.stderr, process.stderr);

  child.on("error", (error) => {
    console.error(`${tag(name, "31")} could not start: ${error.message}`);
    children.delete(child);
    if (!optional) shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (!children.has(child)) return;
    children.delete(child);
    if (shuttingDown) return;

    const reason = signal ? `signal ${signal}` : `exit code ${code ?? 0}`;
    if (optional) {
      console.warn(`${tag(name, "33")} stopped (${reason}); continuing without it.`);
      return;
    }
    console.error(`${tag(name, "31")} stopped unexpectedly (${reason}). Shutting everything down.`);
    shutdown(code && code > 0 ? code : 1);
  });

  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${paint("90", "Stopping dev services...")}`);

  for (const child of [...children.keys()]) killTree(child);
  children.clear();

  // Give taskkill/kill a moment to release the ports before exiting.
  setTimeout(() => process.exit(code), 400);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(signal, () => shutdown(0));
}
process.on("exit", () => {
  for (const child of children.keys()) killTree(child);
});

/* ------------------------------------------------------------------ probes */

async function backendIsUp() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      signal: AbortSignal.timeout(1_500),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForBackend(timeoutMs) {
  const startedAt = Date.now();
  let lastNotice = startedAt;

  while (Date.now() - startedAt < timeoutMs) {
    if (await backendIsUp()) return true;
    if (Date.now() - lastNotice > 10_000) {
      lastNotice = Date.now();
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      console.log(`${tag("dev", "90")} still waiting for the backend (${seconds}s)...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function portIsBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(700, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function findAvailablePort(startPort, tries = 20) {
  for (let port = startPort; port < startPort + tries; port += 1) {
    if (!(await portIsBusy(port))) return port;
  }
  return startPort;
}

/* -------------------------------------------------------------------- main */

function printIntro() {
  console.log("");
  console.log(paint("1", "  Fees dashboard - single terminal dev runner"));
  console.log(paint("90", `  repository: ${root}`));
  console.log("");
}

async function main() {
  printIntro();

  const backendWasRunning = await backendIsUp();

  if (backendWasRunning) {
    console.log(`${tag("backend", "36")} already running at ${BACKEND_URL} - reusing it.`);
  } else if (await portIsBusy(new URL(BACKEND_URL).port || 80)) {
    console.error(
      `${tag("backend", "31")} port ${new URL(BACKEND_URL).port || 80} is in use by another program.`
    );
    console.error(
      `${tag("backend", "31")} stop that program, or change PORT in backend/.env and BACKEND_URL.`
    );
    shutdown(1);
    return;
  } else {
    console.log(`${tag("backend", "36")} starting API (Appwrite) at ${BACKEND_URL} ...`);
    startTask("backend", "36", "npm", ["run", "dev", "--workspace=backend"]);

    const ready = await waitForBackend(BACKEND_READY_TIMEOUT_MS);
    if (!ready) {
      console.error(
        `${tag("backend", "31")} did not answer /api/health within ${Math.round(
          BACKEND_READY_TIMEOUT_MS / 1000
        )}s.`
      );
      console.error(
        `${tag("backend", "31")} check backend/.env (APPWRITE_API_KEY) and the error log above.`
      );
      shutdown(1);
      return;
    }
    console.log(`${tag("backend", "36")} ready - database: Appwrite`);
  }

  const frontendPort = await findAvailablePort(FRONTEND_PORT);
  if (frontendPort !== FRONTEND_PORT) {
    console.warn(
      `${tag("frontend", "33")} port ${FRONTEND_PORT} is busy; using ${frontendPort} instead.`
    );
  }

  console.log(
    `${tag("frontend", "35")} starting Next.js on http://localhost:${frontendPort} ...`
  );
  startTask("frontend", "35", "npm", [
    "run",
    "dev",
    "--workspace=frontend",
    "--",
    "-p",
    String(frontendPort),
  ]);

  const gatewayDir = path.join(root, "payment-gateway");
  const gatewayInstalled = existsSync(path.join(gatewayDir, "node_modules"));

  if (gatewayDisabled) {
    console.log(`${tag("gateway", "90")} skipped (--no-gateway).`);
  } else if (gatewayInstalled) {
    console.log(`${tag("gateway", "33")} starting YOUPI PG on http://localhost:6100 ...`);
    startTask("gateway", "33", "npm", ["--prefix", "payment-gateway", "run", "dev"], {
      optional: true,
    });
  } else if (gatewayRequested) {
    console.error(
      `${tag("gateway", "31")} payment-gateway/node_modules is missing. Run: npm run gateway:install`
    );
    shutdown(1);
    return;
  } else {
    console.log(
      `${tag("gateway", "90")} skipped - run "npm run gateway:install" to enable the payment gateway.`
    );
  }

  console.log("");
  console.log(paint("90", "  ------------------------------------------------------------"));
  console.log(`  Frontend    ${paint("36", `http://localhost:${frontendPort}`)}`);
  console.log(`  Backend     ${paint("36", `${BACKEND_URL}/api/health`)}`);
  console.log(`  Database    ${paint("36", "Appwrite (database: fees)")}`);
  if (!gatewayDisabled && gatewayInstalled) {
    console.log(`  Gateway     ${paint("36", "http://localhost:6100")}`);
  }
  console.log(paint("90", "  ------------------------------------------------------------"));
  console.log(`  ${paint("1", "All services share this terminal. Press Ctrl+C to stop everything.")}`);
  console.log("");
}

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
