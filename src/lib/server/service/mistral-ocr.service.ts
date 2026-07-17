import { Mistral } from '@mistralai/mistralai';
import { SDKError, HTTPValidationError } from '@mistralai/mistralai/models/errors';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { env as defaultEnv } from '$env/dynamic/private';
import { resolveMistralApiKey } from '$lib/server/mastra/provider/ocr-key-resolver';

let lastCallTimestamp = 0;
let lastCallPromise: Promise<void> = Promise.resolve();

export interface MistralClientContext {
	db: LibSQLDatabase<any>;
	userId: number;
	/** School scope. Required for the pool tier to be consulted. */
	schoolId: number | null;
	/** User role string (e.g. 'class_teacher'). Used for pool consumerRoles gating. */
	userRole?: string | null;
	env?: Record<string, string | undefined>;
}

export class MistralOcrService {
  private static instance: MistralOcrService;

  private constructor() {}

  public static getInstance(): MistralOcrService {
    if (!MistralOcrService.instance) {
      MistralOcrService.instance = new MistralOcrService();
    }
    return MistralOcrService.instance;
  }

  private async getClient(ctx: MistralClientContext): Promise<Mistral> {
    const apiKey = await resolveMistralApiKey({
      db: ctx.db,
      userId: ctx.userId,
      schoolId: ctx.schoolId,
      userRole: ctx.userRole,
      env: ctx.env
    });
    return new Mistral({ apiKey });
  }

  /**
   * Enforces artificial 2.5-second cooldown between sequential requests
   */
  private async enforceCooldown(): Promise<void> {
    const currentCallPromise = lastCallPromise.then(async () => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallTimestamp;
      if (timeSinceLastCall < 2500) {
        await new Promise((resolve) => setTimeout(resolve, 2500 - timeSinceLastCall));
      }
      lastCallTimestamp = Date.now();
    });
    lastCallPromise = currentCallPromise.catch(() => {});
    await currentCallPromise;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error: any) {
        if (error instanceof HTTPValidationError) {
          throw error;
        }
        if (error instanceof SDKError) {
          const sdkErr = error as any;
          const status = sdkErr.httpMeta?.response?.status;
          if (status === 400 || status === 401) {
            throw error;
          }
          if (status === 429 || status === 500 || status === 503) {
            attempt++;
            if (attempt <= 3) {
              const delay = Math.pow(2, attempt - 1) * 1000;
              console.warn(`[MistralOcrService] Transient error ${status}. Retrying attempt ${attempt} in ${delay}ms...`);
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
          }
        }
        throw error;
      }
    }
  }

  /**
   * Run OCR processing on a single file using the direct file upload mechanism.
   * Leverages direct in-memory snapshotting via Blob or Buffer content.
   */
  public async processDocument(
    fileContent: Blob | Buffer | Uint8Array,
    fileName: string,
    ctx: MistralClientContext
  ) {
    await this.enforceCooldown();

    return this.withRetry(async () => {
      const client = await this.getClient(ctx);

      // Convert fileContent to a Blob if it is Buffer or Uint8Array, or keep it as is
      const uploadPayload = fileContent instanceof Blob
        ? fileContent
        : new Blob([fileContent as any]);

      // Upload the file to Mistral
      const uploadedFile = await client.files.upload({
        file: {
          fileName: fileName,
          content: uploadPayload,
        },
        purpose: 'ocr',
      });

      // Run OCR process
      const ocrResponse = await client.ocr.process({
        model: 'mistral-ocr-latest',
        document: {
          type: 'file',
          fileId: uploadedFile.id,
        },
        includeImageBase64: true,
      });

      // Log usage info
      console.info(JSON.stringify({
        event: 'ocr_usage',
        model: ocrResponse.model,
        pagesProcessed: ocrResponse.usageInfo.pagesProcessed,
        docSizeBytes: ocrResponse.usageInfo.docSizeBytes ?? (fileContent instanceof Blob ? fileContent.size : fileContent.byteLength) ?? undefined,
      }));

      (ocrResponse as any).fileId = uploadedFile.id;
      return ocrResponse;
    });
  }

  /**
   * Run OCR with structured output: returns a normalized JSON payload
   * extracted from the document. Uses Mistral's documentAnnotationFormat
   * parameter to enforce a JSON schema on the OCR response.
   *
   * Used by the upload route to write a normalized JSON to the workspace's
   * `extracted/<documentId>.json` without requiring a second LLM pass.
   */
  public async processStructured(
    fileContent: Blob | Buffer | Uint8Array,
    fileName: string,
    jsonSchema: Record<string, unknown>,
    ctx: MistralClientContext,
  ): Promise<unknown> {
    await this.enforceCooldown();

    return this.withRetry(async () => {
      const client = await this.getClient(ctx);

      const uploadPayload = fileContent instanceof Blob
        ? fileContent
        : new Blob([fileContent as BlobPart]);

      const uploadedFile = await client.files.upload({
        file: {
          fileName: fileName,
          content: uploadPayload,
        },
        purpose: 'ocr',
      });

      const ocrResponse = await client.ocr.process({
        model: 'mistral-ocr-latest',
        document: {
          type: 'file',
          fileId: uploadedFile.id,
        },
        includeImageBase64: false,
        documentAnnotationFormat: jsonSchema,
      } as never);

      const result = { ...ocrResponse, fileId: uploadedFile.id };
      return result;
    });
  }

  /**
   * Get OCR markdown for a file that was previously uploaded (has a fileId).
   * Downloads processed OCR markdown on-demand from Mistral.
   */
  public async getMarkdownByFileId(ctx: MistralClientContext, fileId: string): Promise<string> {
    return this.withRetry(async () => {
      const client = await this.getClient(ctx);

      // Validate file exists & is accessible under current client (tenant API key)
      const fileInfo = await client.files.retrieve({ fileId });
      if (!fileInfo) {
        throw new Error(`File ${fileId} not found or inaccessible under the current tenant context.`);
      }

      // Run OCR processing on the file
      const ocrResponse = await client.ocr.process({
        model: 'mistral-ocr-latest',
        document: {
          type: 'file',
          fileId: fileId,
        },
        includeImageBase64: true,
      });

      // Concatenate all page markdowns
      const markdown = (ocrResponse.pages || []).map((p: any) => p.markdown).join('\n\n');
      return markdown;
    });
  }

  /**
   * Create a batch OCR job for multiple files.
   * Uploads files sequentially (or you could do Promise.all depending on 429 limits)
   * then submits them as a single Batch Job.
   */
  public async createBatchJob(
    files: Array<{ fileName: string; content: Blob | Buffer | Uint8Array; customId: string }>,
    ctx: MistralClientContext,
  ) {
    return this.withRetry(async () => {
      const client = await this.getClient(ctx);
      const requests = [];

      for (const file of files) {
        const uploadPayload = file.content instanceof Blob
          ? file.content
          : new Blob([file.content as any]);

        const uploadedFile = await client.files.upload({
          file: {
            fileName: file.fileName,
            content: uploadPayload,
          },
          purpose: 'ocr',
        });

        requests.push({
          customId: `${file.customId}:${uploadedFile.id}`,
          body: {
            model: 'mistral-ocr-latest',
            document: {
              type: 'file',
              file_id: uploadedFile.id,
            },
            include_image_base64: true,
          }
        });
      }

      const job = await client.batch.jobs.create({
        requests,
        model: 'mistral-ocr-latest',
        endpoint: '/v1/ocr',
        metadata: { job_type: 'extraction' },
      });

      return { jobId: job.id, status: job.status, total: requests.length };
    });
  }

  /**
   * Polls a batch job and returns its status
   */
  public async pollBatchJob(jobId: string, ctx: MistralClientContext) {
    return this.withRetry(async () => {
      const client = await this.getClient(ctx);
      const job = await client.batch.jobs.get({ jobId });

      return {
        jobId: job.id,
        status: job.status,
        succeeded: job.succeededRequests,
        failed: job.failedRequests,
        total: job.totalRequests,
        outputFileId: job.outputFile,
        errorFileId: job.errorFile,
      };
    });
  }

  /**
   * Download and parse batch results from a completed job's outputFileId.
   */
  public async downloadBatchResults(outputFileId: string, ctx: MistralClientContext) {
    return this.withRetry(async () => {
      const client = await this.getClient(ctx);
      // download() returns a ReadableStream<Uint8Array>
      const stream = await client.files.download({ fileId: outputFileId });

      const reader = stream.getReader();
      const decoder = new TextDecoder('utf-8');
      let text = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();

      const lines = text.split('\n').filter(line => line.trim().length > 0);
      const results: Array<{ customId: string; fileId: string; markdown: string }> = [];

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const responseBody = parsed.response?.body;
          if (responseBody) {
            const customIdParts = (parsed.custom_id || '').split(':');
            const customId = customIdParts[0] || '';
            const fileId = customIdParts[1] || customId;
            const markdown = (responseBody.pages || []).map((p: any) => p.markdown).join('\n\n');
            results.push({
              customId,
              fileId,
              markdown
            });
          }
        } catch (e) {
          console.error('[MistralOcrService] Error parsing batch result line', e);
        }
      }

      return results;
    });
  }
}

export const mistralOcrService = MistralOcrService.getInstance();

