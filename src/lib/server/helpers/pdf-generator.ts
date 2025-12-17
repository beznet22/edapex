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
  error?: string;
}

/**
 * Helper function to clean up temporary files.
 * Note: Assumes file paths are provided as arguments.
 */
function cleanupTempFiles(...files: string[]) {
  files.forEach((file) => {
    if (existsSync(file)) {
      try {
        unlinkSync(file);
        console.log(`Cleaned up ${file}`);
      } catch (err) {
        console.error(`Failed to clean up ${file}:`, err);
      }
    }
  });
}

/**
 * Helper function to clean up an entire temporary directory.
 * @param dirPath - Path to the directory to be removed
 */
async function cleanupTempDirectory(dirPath: string) {
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
 * Generate PDF or image preview from HTML content using html2pdf binary (PrinceXML)
 * @param htmlContent - The HTML content to convert
 * @param fileName - The name for the temporary files (without extension)
 * @param preview - If true, returns the first page as a JPEG image for preview
 * @returns Promise with PDF buffer, image buffer(s), or error
 */
export async function generate(
  htmlContent: string,
  fileName: string,
  preview?: boolean
): Promise<GenerationResult> {
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

          const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

          // Clean up the entire unique temp directory
          await cleanupTempDirectory(uniqueTempDir);
          return { success: true, zipBuffer };
        } else {
          // For PDF mode, we expect exactly one file
          const pdfBuffer = readFileSync(createdFiles[0]);
          // Clean up the entire unique temp directory
          await cleanupTempDirectory(uniqueTempDir);
          return { success: true, pdfBuffer };
        }
      } else {
        // Cleanup the entire unique temp directory if no output was generated
        await cleanupTempDirectory(uniqueTempDir);
        return {
          success: false,
          error: `Output file(s) were not created. Stderr usually contains more info, but was not captured here.`,
        };
      }
    } catch (execError: any) {
      // Cleanup the entire unique temp directory on execution error
      await cleanupTempDirectory(uniqueTempDir);
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
        await cleanupTempDirectory(uniqueTempDir);
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
