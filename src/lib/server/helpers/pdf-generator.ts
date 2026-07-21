import { writeFile, mkdir, readdir, rm, stat } from "fs/promises";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

// Resolve filesystem paths relative to this module's location so the helper
// works regardless of the working directory it is invoked from.
const html2pdfPath = fileURLToPath(new URL("../../../../bin/html2pdf", import.meta.url));
const baseTempDir = fileURLToPath(new URL("../../../../temp", import.meta.url));
const TEMP_DIR_TTL_MS = 60 * 60 * 1000;
let sweepPerformed = false;

interface GenerationResult {
  success: boolean;
  pdfBuffer?: Buffer;
  filePath?: string;
  error?: string;
}

/**
 * Lazy, idempotent TTL sweep: removes `temp/<uuid>/` directories older than 1
 * hour on first invocation. Subsequent calls within the same process are no-ops.
 */
async function sweepStaleTempDirs(): Promise<void> {
  if (sweepPerformed) return;
  sweepPerformed = true;
  if (!existsSync(baseTempDir)) return;
  try {
    const entries = await readdir(baseTempDir, { withFileTypes: true });
    const now = Date.now();
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const dirPath = join(baseTempDir, entry.name);
          try {
            const stats = await stat(dirPath);
            if (now - stats.mtimeMs > TEMP_DIR_TTL_MS) {
              await rm(dirPath, { recursive: true, force: true });
            }
          } catch {
            // best-effort cleanup; ignore individual failures
          }
        }),
    );
  } catch {
    // best-effort cleanup; ignore sweep failures
  }
}

/**
 * Helper function to clean up an entire temporary directory.
 * @param dirPath - Path to the directory to be removed
 */
export async function cleanup(dirPath: string) {
  if (existsSync(dirPath)) {
    try {
      await rm(dirPath, { recursive: true, force: true }); // This will remove the entire directory and its contents
      console.log(`Cleaned up directory ${dirPath}`);
    } catch (err) {
      console.error(`Failed to clean up directory ${dirPath}:`, err);
    }
  }
}

/**
 * Generate PDF from HTML content using the html2pdf binary.
 *
 * @param params.htmlContent - The HTML string to render
 * @param params.fileName - The base name for temp files (without extension)
 * @param params.returnPath - If true, returns the absolute path to the PDF instead of the buffer
 * @returns GenerationResult with either pdfBuffer / filePath on success, or error on failure
 */
export async function generate(params: {
  htmlContent: string;
  fileName: string;
  returnPath?: boolean;
}): Promise<GenerationResult> {
  const { htmlContent, fileName, returnPath = false } = params;

  // Validate inputs
  if (!htmlContent || typeof htmlContent !== "string") {
    return {
      success: false,
      error: "Invalid HTML content provided",
    };
  }

  if (!fileName || typeof fileName !== "string") {
    return {
      success: false,
      error: "Invalid file name provided",
    };
  }

  // Create unique temp directory using a random UUID to prevent race conditions
  await sweepStaleTempDirs();
  const uniqueTempDir = join(baseTempDir, randomUUID());

  try {
    if (!existsSync(html2pdfPath)) {
      return {
        success: false,
        error: "html2pdf binary not found at: " + html2pdfPath,
      };
    }

    if (!existsSync(uniqueTempDir)) {
      await mkdir(uniqueTempDir, { recursive: true, mode: 0o755 });
    }

    // Sanitize fileName to prevent command injection
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const tempHtmlFile = join(uniqueTempDir, `${sanitizedFileName}.html`);
    await writeFile(tempHtmlFile, htmlContent, "utf-8");

    const tempPdfFile = join(uniqueTempDir, `${sanitizedFileName}.pdf`);
    // Flags accepted by the deployed bin/html2pdf (verified via --help):
    //   --page-size A4                      A4, A3, A5, Letter, Legal, Tabloid,
    //                                       or custom like '210mmx297mm'
    //   --page-margin "4mm 2mm 2mm 2mm"     1/2/4 values; binary accepts mm directly
    //                                       (--page-margin singular — the binary does
    //                                       NOT accept --margins or --scale or --background)
    //   -o <PATH>                           output path; defaults to <input>.pdf alongside input
    const commandArgs = [
      "--page-size", "A4",
      "--page-margin", "4mm 2mm 2mm 2mm",
      "-o", tempPdfFile,
      tempHtmlFile,
    ];

    let lastStderr = "";
    try {
      const { stderr } = await execFileAsync(html2pdfPath, commandArgs, {
        shell: false,
        timeout: 30_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      lastStderr = Buffer.isBuffer(stderr) ? stderr.toString("utf-8") : stderr;

      if (existsSync(tempPdfFile)) {
        if (returnPath) {
          // Do NOT clean up directory — caller needs the file path
          return { success: true, filePath: tempPdfFile };
        }
        const pdfBuffer = readFileSync(tempPdfFile);
        await cleanup(uniqueTempDir);
        return { success: true, pdfBuffer };
      }

      await cleanup(uniqueTempDir);
      return {
        success: false,
        error: lastStderr
          ? `html2pdf produced no output. stderr: ${lastStderr.trim()}`
          : `html2pdf produced no output (no stderr captured).`,
      };
    } catch (execError: unknown) {
      await cleanup(uniqueTempDir);
      const stderr =
        typeof execError === "object" && execError !== null && "stderr" in execError
          ? Buffer.isBuffer((execError as { stderr?: unknown }).stderr)
            ? ((execError as { stderr: Buffer }).stderr.toString("utf-8"))
            : typeof (execError as { stderr?: unknown }).stderr === "string"
              ? ((execError as { stderr: string }).stderr)
              : ""
          : "";
      const message =
        execError instanceof Error ? execError.message : String(execError);
      return {
        success: false,
        error: stderr
          ? `html2pdf execution failed: ${message} | stderr: ${stderr.trim()}`
          : `html2pdf execution failed: ${message}`,
      };
    }
  } catch (error: unknown) {
    try {
      if (existsSync(uniqueTempDir)) {
        await cleanup(uniqueTempDir);
      }
    } catch (cleanupError) {
      console.error("Error during cleanup in catch block:", cleanupError);
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Generation failed: ${message}`,
    };
  }
}
