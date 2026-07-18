import { Mistral } from "@mistralai/mistralai";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cwd } from "node:process";

const MODEL = "mistral-ocr-latest";
const FILE_PATH = process.argv.find((a) => a.startsWith("--file="))?.slice(7)
  ?? process.argv[2]
  ?? ".workspaces/1/AY4-2025/2026/12-c_5-a/exams/examType-6/uploads/edor.jpg";

const apiKey = process.env["MISTRAL_API_KEY"];
if (!apiKey) { console.error("MISTRAL_API_KEY required"); process.exit(1); }

const client = new Mistral({ apiKey });

function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const mime: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };
  return mime[ext ?? ""] ?? "application/octet-stream";
}

async function main() {
  console.log(`═══ Speed Test: Serial vs Parallel (2 files) ═══\n`);

  const fileBytes = await readFile(resolve(cwd(), FILE_PATH));
  const fileName = FILE_PATH.split("/").pop() ?? "test-file";
  const uploaded = await client.files.upload({
    file: { fileName, content: new Blob([fileBytes], { type: guessMime(fileName) }) },
    purpose: "ocr",
  });
  const fileId = uploaded.id;
  console.log(`  File uploaded → ${fileId}\n`);

  // Serial: 2 requests, one at a time
  console.log("  ⏱️  Running serial (2 sequential requests)…");
  let sStart = Date.now();
  for (let i = 0; i < 2; i++) {
    await client.ocr.process({ model: MODEL, document: { type: "file", fileId }, includeImageBase64: false });
  }
  let serialTotal = Date.now() - sStart;

  // Parallel: 2 requests at once
  console.log("  ⏱️  Running parallel (2 concurrent requests)…");
  let pStart = Date.now();
  await Promise.all([
    client.ocr.process({ model: MODEL, document: { type: "file", fileId }, includeImageBase64: false }),
    client.ocr.process({ model: MODEL, document: { type: "file", fileId }, includeImageBase64: false }),
  ]);
  let parallelTotal = Date.now() - pStart;

  console.log(`\n  Results (2 files):`);
  console.log(`    Sequential:  ${serialTotal}ms total (${Math.round(serialTotal / 2)}ms avg/file)`);
  console.log(`    Parallel:    ${parallelTotal}ms total (${Math.round(parallelTotal / 2)}ms avg/file)`);
  console.log(`    Speedup:     ${(serialTotal / parallelTotal).toFixed(1)}x faster\n`);

  await client.files.delete({ fileId });
  console.log(`  Cleaned up\n`);
}

main().catch(console.error);
