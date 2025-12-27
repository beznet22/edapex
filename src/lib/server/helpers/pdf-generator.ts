import { writeFile, readFile, mkdir, unlink, readdir, rm } from "fs/promises";
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { render } from "svelte/server";
import { randomUUID } from "crypto";
import JSZip from "jszip";

const execAsync = promisify(exec);

interface GenerationResult {
  success: boolean;
  pdfBuffer?: Buffer;
  imageBuffers?: Buffer[]; // Add support for multiple image buffers
  zipBuffer?: Buffer; // Add support for ZIP buffer when previewing
  filePath?: string; // Add support for returning absolute filepath
  error?: string;
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
  const baseTempDir = join(process.cwd(), "temp");
  const uniqueTempDir = join(baseTempDir, randomUUID());

  try {
    // Path to html2pdf binary
    const html2pdfPath = join(process.cwd(), "bin/html2pdf");
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
    let command = "";

    if (preview) {
      expectedExtension = ".jpeg";
      // Use a template for multiple page output: page number padded to 2 digits
      const outputTemplate = join(uniqueTempDir, `${sanitizedFileName}_page_%02d${expectedExtension}`);

      // Command for ALL pages: remove --raster-pages=first
      const commandArgs = [
        `"${html2pdfPath}"`,
        '--page-margin "4mm 2mm 2mm 2mm"',
        `--raster-output="${outputTemplate}"`,
        "--raster-dpi 150",
        `"${tempHtmlFile}"`,
      ];
      command = commandArgs.join(" ");
    } else {
      expectedExtension = ".pdf";
      const tempPdfFile = join(uniqueTempDir, `${sanitizedFileName}${expectedExtension}`);
      const commandArgs = [
        `"${html2pdfPath}"`,
        '--page-margin "4mm 2mm 2mm 2mm"',
        `-o "${tempPdfFile}"`,
        `"${tempHtmlFile}"`,
      ];
      command = commandArgs.join(" ");
    }

    try {
      await execAsync(command);

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
          error: `Output file(s) were not created. Stderr usually contains more info, but was not captured here.`,
        };
      }
    } catch (execError: any) {
      // Cleanup the entire unique temp directory on execution error
      await cleanup(uniqueTempDir);
      // A more robust cleanup might involve searching for all generated files again

      return {
        success: false,
        error: `html2pdf execution failed: ${execError.message}`,
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
