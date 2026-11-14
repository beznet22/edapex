#!/usr/bin/env node
/**
 * Wall-clock benchmark for `POST /claim` against a running `wrangler dev`.
 *
 * The CPU gate is the Workers-pool test (`tests/services/claim-cpu-budget`);
 * this script reports end-to-end latency, including local D1 I/O. The valid
 * mode is capped at five attempts per email per minute by the claim policy.
 */
const args = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const baseUrl = valueOf("--url", "http://127.0.0.1:8787");
const mode = valueOf("--mode", "unknown");
const email = valueOf("--email");
const password = valueOf("--password", process.env.CLAIM_PASSWORD);
const requested = Number(valueOf("--iterations", "30"));

if (password === undefined) {
  console.error("usage: node scripts/bench-claim.mjs --password <shared> [--mode unknown|valid]");
  process.exit(1);
}
if (mode === "valid" && email === undefined) {
  console.error("valid mode requires --email");
  process.exit(1);
}
const iterations = mode === "valid" ? Math.min(requested, 5) : requested;

const percentile = (samples, fraction) => {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
};

const samples = [];
const statuses = new Map();

for (let index = 0; index < iterations; index += 1) {
  const address = mode === "valid" ? email : `bench-${index}@example.test`;
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/v1/auth/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "cf-connecting-ip": `198.51.100.${(index % 200) + 10}`
    },
    body: JSON.stringify({ email: address, password })
  });
  await response.text();
  samples.push(performance.now() - started);
  statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
}

console.log(`mode: ${mode}`);
console.log(`iterations: ${iterations}`);
console.log(`statuses: ${[...statuses.entries()].map(([code, count]) => `${code}×${count}`).join(", ")}`);
console.log(`p50: ${percentile(samples, 0.5).toFixed(2)} ms`);
console.log(`p95: ${percentile(samples, 0.95).toFixed(2)} ms`);
console.log(`max: ${Math.max(...samples).toFixed(2)} ms`);
console.log("Note: wall clock includes local D1 I/O; the 10 ms gate is CPU, measured in the Workers pool.");
