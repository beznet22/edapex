import { writeFile, mkdir, readdir, rm, stat } from "fs/promises";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import JSZip from "jszip";

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
  imageBuffers?: Buffer[]; // Add support for multiple image buffers
  zipBuffer?: Buffer; // Add support for ZIP buffer when previewing
  filePath?: string; // Add support for returning absolute filepath
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
 * Generate PDF or image preview from HTML content using html2pdf binary
 * @param params - Configuration object OR htmlContent string
 * @param fileName - The name for the temporary files (without extension) if first param is string
 * @param preview - If true, returns the first page as a JPEG image for preview
 * @param returnPath - If true, returns the absolute path to the generated file instead of buffer
 * @returns Promise with PDF buffer, image buffer(s), file path, or error
 */
export async function generate(
  params: {
    htmlContent: string;
    fileName: string;
    preview?: boolean;
    returnPath?: boolean;
  }
): Promise<GenerationResult>;

export async function generate(
  htmlContent: string,
  fileName: string,
  preview?: boolean,
  returnPath?: boolean
): Promise<GenerationResult>;


export async function generate(
  first: string | { htmlContent: string; fileName: string; preview?: boolean; returnPath?: boolean },
  second?: string,
  third?: boolean,
  fourth?: boolean
): Promise<GenerationResult> {
  let htmlContent: string;
  let fileName: string;
  let preview: boolean | undefined;
  let returnPath = false;

  if (typeof first === "object") {
    htmlContent = first.htmlContent;
    fileName = first.fileName;
    preview = first.preview;
    returnPath = !!first.returnPath;
  } else {
    htmlContent = first;
    fileName = second!;
    preview = third;
    returnPath = !!fourth;
  }

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

    // We can't predefine output filenames for "all pages" rasterization easily,
    // so we'll rely on reading the directory after execution.
    let expectedExtension = "";
    let commandArgs: string[] = [];
    let lastStderr = "";

    if (preview) {
      expectedExtension = ".jpeg";
      // Use a template for multiple page output: page number padded to 2 digits
      const outputTemplate = join(uniqueTempDir, `${sanitizedFileName}_page_%02d${expectedExtension}`);

      // Command for ALL pages: remove --raster-pages=first
      commandArgs = [
        "--page-margin",
        "4mm 2mm 2mm 2mm",
        "--raster-output",
        outputTemplate,
        "--raster-dpi",
        "150",
        tempHtmlFile,
      ];
    } else {
      expectedExtension = ".pdf";
      const tempPdfFile = join(uniqueTempDir, `${sanitizedFileName}${expectedExtension}`);
      commandArgs = [
        "--page-margin",
        "4mm 2mm 2mm 2mm",
        "-o",
        tempPdfFile,
        tempHtmlFile,
      ];
    }

    try {
      const { stderr } = await execFileAsync(html2pdfPath, commandArgs, {
        shell: false,
        timeout: 30_000,
        maxBuffer: 64 * 1024 * 1024,
      });
      lastStderr = Buffer.isBuffer(stderr) ? stderr.toString("utf-8") : stderr;

      // After execution, find the relevant files in the temp directory
      const createdFiles = readdirSync(uniqueTempDir)
        .filter((file) => file.startsWith(sanitizedFileName) && file.endsWith(expectedExtension))
        .map((file) => join(uniqueTempDir, file))
        .sort(); // Sort to ensure pages are in order

      if (createdFiles.length > 0) {
        if (preview) {
          // Get all files in the temp directory (PDF and images)
          const allFiles = readdirSync(uniqueTempDir);

          // Create a ZIP file containing all files
          const zip = new JSZip();

          for (const file of allFiles) {
            if (file.endsWith(".html")) continue;
            const filePath = join(uniqueTempDir, file);
            const fileBuffer = readFileSync(filePath);
            zip.file(file, fileBuffer);
          }

          if (returnPath) {
            const zipPath = join(uniqueTempDir, `${sanitizedFileName}_files.zip`);
            const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
            await writeFile(zipPath, zipBuffer);
            // Do NOT clean up directory as the user needs the file
            return { success: true, filePath: zipPath };
          }

          const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

          // Clean up the entire unique temp directory
          await cleanup(uniqueTempDir);
          return { success: true, zipBuffer };
        } else {
          // For PDF mode, we expect exactly one file
          const pdfPath = createdFiles[0];

          if (returnPath) {
            // Do NOT clean up directory
            return { success: true, filePath: pdfPath };
          }

          const pdfBuffer = readFileSync(pdfPath);
          // Clean up the entire unique temp directory
          await cleanup(uniqueTempDir);
          return { success: true, pdfBuffer };
        }
      } else {
        // Cleanup the entire unique temp directory if no output was generated
        await cleanup(uniqueTempDir);
        return {
          success: false,
          error: lastStderr
            ? `html2pdf produced no output. stderr: ${lastStderr.trim()}`
            : `html2pdf produced no output (no stderr captured).`,
        };
      }
    } catch (execError: unknown) {
      // Cleanup the entire unique temp directory on execution error
      await cleanup(uniqueTempDir);
      // A more robust cleanup might involve searching for all generated files again
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
  } catch (error: any) {
    // Ensure cleanup happens even if there's an unexpected error
    try {
      if (existsSync(uniqueTempDir)) {
        await cleanup(uniqueTempDir);
      }
    } catch (cleanupError) {
      console.error("Error during cleanup in catch block:", cleanupError);
    }
    return {
      success: false,
      error: `Generation failed: ${error.message}`,
    };
  }
}
