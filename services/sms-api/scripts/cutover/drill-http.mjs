/**
 * Worker lifecycle and HTTP helpers for the local cutover drill.
 *
 * Everything is local: `wrangler dev --local --persist-to <copy>`. The only
 * remote calls in the repository are generated text in the preflight plan.
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{
 *   appRoot: string,
 *   persist: string,
 *   port: number,
 *   claimEnabled: boolean,
 *   digest: string,
 *   cookieSecret: string,
 *   logFile: string
 * }} options
 */
export function startWorker(options) {
  const args = [
    "exec",
    "wrangler",
    "dev",
    "--local",
    "--persist-to",
    options.persist,
    "--port",
    String(options.port),
    "--inspector-port",
    String(options.port + 400)
  ];
  if (options.claimEnabled) {
    args.push(
      "--var",
      "CLAIM_ENABLED:1",
      "--var",
      `CLAIM_PASSWORD_DIGEST:${options.digest}`,
      "--var",
      `AUTH_COOKIE_SECRET:${options.cookieSecret}`
    );
  }
  const stream = createWriteStream(options.logFile);
  const child = spawn("pnpm", args, {
    cwd: options.appRoot,
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true
  });
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  return {
    child,
    logFile: options.logFile,
    baseUrl: `http://127.0.0.1:${options.port}`
  };
}

/**
 * @param {{ child: import("node:child_process").ChildProcess, baseUrl: string }} worker
 * @param {number} timeoutMs
 */
export async function waitForHealth(worker, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${worker.baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Worker not listening yet.
    }
    if (worker.child.exitCode !== null) {
      throw new Error(`wrangler dev exited with ${worker.child.exitCode}`);
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${worker.baseUrl}/health`);
}

/**
 * @param {{ child: import("node:child_process").ChildProcess } | null} worker
 */
export async function stopWorker(worker) {
  if (worker === null) return;
  const pid = worker.child.pid;
  const signalGroup = (signal) => {
    if (pid === undefined) return;
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        worker.child.kill(signal);
      } catch {
        // Already gone.
      }
    }
  };
  signalGroup("SIGTERM");
  const deadline = Date.now() + 10_000;
  while (worker.child.exitCode === null && Date.now() < deadline) await sleep(200);
  if (worker.child.exitCode === null) signalGroup("SIGKILL");
  await sleep(500);
}

/**
 * @param {string} baseUrl
 * @param {string} pathname
 * @param {{ method?: string, headers?: Record<string, string>, body?: unknown }} [options]
 */
export async function request(baseUrl, pathname, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const body =
    options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers,
    body
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Non-JSON responses are valid for the health/claim probes.
  }
  return { status: response.status, headers: response.headers, text, json };
}
