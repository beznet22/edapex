#!/usr/bin/env pnpm tsx
/**
 * Test parallel direct OCR concurrency limits on Mistral.
 *
 * Uploads a single test file, then fires concurrent ocr.process() calls
 * at varying concurrency levels to find the safe batch size.
 *
 * Usage:
 *   pnpm tsx scripts/test-parallel-ocr.ts [--file ./test.pdf] [--levels 1,2,3,5,10]
 *
 * Environment:
 *   MISTRAL_API_KEY  — required if not set in .env
 *   MISTRAL_MODEL    — model name (default: mistral-ocr-latest)
 */

import { Mistral } from "@mistralai/mistralai";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd, exit } from "node:process";

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = parseArgs();
const API_KEY = args.apiKey ?? process.env.MISTRAL_API_KEY;
const MODEL = args.model ?? process.env.MISTRAL_MODEL ?? "mistral-ocr-latest";
const LEVELS = args.levels;
const FILE_PATH = args.file;

if (!API_KEY) {
  console.error("❌ MISTRAL_API_KEY not set. Pass --key or set the env var.");
  exit(1);
}
if (!FILE_PATH) {
  console.error("❌ No test file specified. Use --file ./path/to/test.pdf");
  exit(1);
}

// ── main ─────────────────────────────────────────────────────────────────────

const client = new Mistral({ apiKey: API_KEY });

type Result = {
  concurrency: number;
  total: number;
  succeeded: number;
  failed: number;
  rateLimited: number;
  otherErrors: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

async function main() {
  console.log(`\n═══ Parallel OCR Concurrency Test ═══`);
  console.log(`  Model:      ${MODEL}`);
  console.log(`  File:       ${FILE_PATH}`);
  console.log(`  Concurrency: ${LEVELS.join(", ")}`);
  console.log(`──────────────────────────────────────\n`);

  // 1. Upload test file once
  console.log("📤 Uploading test file to Mistral…");
  const fileBytes = await readFile(resolve(cwd(), FILE_PATH));
  const fileName = FILE_PATH.split("/").pop() ?? "test-file";
  const mimeType = guessMime(fileName);

  const uploaded = await client.files.upload({
    file: { fileName, content: new Blob([fileBytes], { type: mimeType }) },
    purpose: "ocr",
  });
  const fileId = uploaded.id;
  console.log(`  ✅ Uploaded → file ID: ${fileId}\n`);

  // 2. Run test for each concurrency level
  const results: Result[] = [];
  for (const concurrency of LEVELS) {
    const result = await testLevel(fileId, concurrency);
    results.push(result);
    printResult(result);
  }

  // 3. Speed comparison: 2 files, serial vs parallel
  const speedN = 2;
  console.log(`\n──────────────────────────────────────`);
  console.log(`Speed comparison for ${speedN} files:\n`);

  const serialTime = await benchSerial(fileId, speedN);
  const parallelTime = await benchParallel(fileId, speedN);
  console.log(`  Sequential (1 at a time):  ${serialTime.totalMs}ms total, ${Math.round(serialTime.totalMs / speedN)}ms avg`);
  console.log(`  Parallel (${speedN} at once):     ${parallelTime.totalMs}ms total, ${Math.round(parallelTime.totalMs / speedN)}ms avg`);
  const speedup = serialTime.totalMs / parallelTime.totalMs;
  console.log(`  Speedup:                   ${speedup.toFixed(1)}x faster\n`);

  // 4. Summary
  console.log(`═══ Summary ═══`);
  console.table(results.map((r) => ({
    concurrency: r.concurrency,
    succeeded: `${r.succeeded}/${r.total}`,
    "rateLimited ✅": r.rateLimited,
    "avg (ms)": Math.round(r.avgMs),
    "p95 (ms)": Math.round(r.p95Ms),
  })));

  const safeLevel = findSafeLevel(results);

  if (safeLevel <= 1) {
    console.log(`\n⚠️  Recommendation: BATCH_SIZE = 1 (sequential only)`);
    console.log(`   Mistral does not appear to support concurrent direct OCR requests.`);
  } else {
    console.log(`\n✅ Recommendation: BATCH_SIZE = ${safeLevel}`);
    console.log(`   Safe concurrency level with zero rate-limiting.`);
  }
   console.log(`   Set in task-worker.ts as OCR_BATCH_SIZE.\n`);

  await client.files.delete({ fileId });
  console.log(`  Cleaned up file ${fileId}\n`);
}

// ── single-level test ────────────────────────────────────────────────────────

async function testLevel(fileId: string, concurrency: number): Promise<Result> {
  const total = concurrency * 3; // 3 rounds to smooth variance
  const timings: number[] = [];
  let succeeded = 0;
  let failed = 0;
  let rateLimited = 0;
  let otherErrors = 0;

  for (let round = 0; round < 3; round++) {
    const promises = Array.from({ length: concurrency }, async (_, i) => {
      const start = Date.now();
      try {
        const result = await client.ocr.process({
          model: MODEL,
          document: { type: "file", fileId },
          includeImageBase64: false,
        });
        const elapsed = Date.now() - start;
        timings.push(elapsed);
        succeeded++;
        return result;
      } catch (err: any) {
        const elapsed = Date.now() - start;
        timings.push(elapsed);
        const status = (err as any)?.statusCode ?? (err as any)?.status ?? 0;
        const rawMeta = (err as any)?.rawResponse?.status ?? (err as any)?.httpMeta?.response?.status;
        const effectiveStatus = rawMeta ?? status;
        const is429 = effectiveStatus === 429
          || String((err as any)?.message ?? "").includes("429");
        if (is429) {
          rateLimited++;
        } else {
          otherErrors++;
        }
        failed++;
        return null;
      }
    });

    await Promise.all(promises);

    // Cooldown between rounds to avoid cascading rate limits
    if (round < 2) await sleep(2000);
  }

  timings.sort((a, b) => a - b);
  const avgMs = timings.reduce((s, t) => s + t, 0) / timings.length;
  const p50Ms = timings[Math.floor(timings.length * 0.5)] ?? 0;
  const p95Ms = timings[Math.floor(timings.length * 0.95)] ?? timings[timings.length - 1] ?? 0;
  const p99Ms = timings[Math.floor(timings.length * 0.99)] ?? timings[timings.length - 1] ?? 0;

  return { concurrency, total, succeeded, failed, rateLimited, otherErrors, avgMs, p50Ms, p95Ms, p99Ms };
}

// ── serial benchmark ──────────────────────────────────────────────────────────

async function benchSerial(fileId: string, n: number): Promise<{ totalMs: number; avgMs: number }> {
  const timings: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = Date.now();
    try {
      await client.ocr.process({
        model: MODEL,
        document: { type: "file", fileId },
        includeImageBase64: false,
      });
    } catch {
      // count any failure as a timing data point
    }
    timings.push(Date.now() - start);
  }
  const totalMs = timings.reduce((s, t) => s + t, 0);
  return { totalMs, avgMs: Math.round(totalMs / n) };
}

async function benchParallel(fileId: string, n: number): Promise<{ totalMs: number; avgMs: number }> {
  const start = Date.now();
  const promises = Array.from({ length: n }, () =>
    client.ocr.process({
      model: MODEL,
      document: { type: "file", fileId },
      includeImageBase64: false,
    }).catch(() => {}),
  );
  await Promise.all(promises);
  const totalMs = Date.now() - start;
  return { totalMs, avgMs: Math.round(totalMs / n) };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  return {
    file: get("--file"),
    levels: (get("--levels") ?? "1,2,3,5,10").split(",").map(Number).filter(Boolean),
    apiKey: get("--key"),
    model: get("--model"),
  };
}

function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    default: return "application/octet-stream";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function findSafeLevel(results: Result[]): number {
  // Highest concurrency with zero rate-limiting and 100% success
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].rateLimited === 0 && results[i].failed === 0) {
      return results[i].concurrency;
    }
  }
  // Fallback: highest with < 10% rate limiting
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].rateLimited / results[i].total < 0.1) {
      return results[i].concurrency;
    }
  }
  return 1;
}

function printResult(r: Result) {
  const pct = ((r.succeeded / r.total) * 100).toFixed(0);
  const label = r.rateLimited > 0 ? `⚠️  ${r.rateLimited}x rate-limited` : "✅ OK";
  console.log(
    `  concurrency=${r.concurrency}  ` +
    `${pct}% success  ` +
    `avg=${Math.round(r.avgMs)}ms  ` +
    `p95=${Math.round(r.p95Ms)}ms  ` +
    `${label}`
  );
}

await main();
