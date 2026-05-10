import type { xUIMessage } from "$lib/types/chat-types";
import { 
  generateObject, 
  generateText, 
  type LanguageModel, 
  type ModelMessage, 
} from "ai";
import { 
  OCR_SYSTEM_PROMPT, 
  MAPPER_SYSTEM_PROMPT, 
  legacyExtractPrompt 
} from "../prompts/extract";
import { resolveProviderForTask, type Provider as InternalProvider } from "../provider/router";
import type { z } from "zod";
import type { DBMessage } from "../db/schema";
import type { ResultInput } from "$lib/schema/result-input";

export type ExtractionResult = 
  | { success: true; data: any; rawText: string; isFallback: false }
  | { success: true; data: any; isFallback: true; rawText?: string }
  | { success: false; error: string };

export function convertToUIMessages(messages: Array<DBMessage>): Array<xUIMessage> {
  return messages.map((message) => ({
    id: message.id,
    parts: message.parts as xUIMessage["parts"],
    role: message.role as xUIMessage["role"],
    metadata: message.metadata as xUIMessage["metadata"],
    createdAt: message.createdAt,
  }));
}

export async function generateTitle({
  message,
  provider,
}: {
  message: xUIMessage;
  provider: InternalProvider;
}): Promise<string> {
  try {
    const result = await generateText({
      model: provider.languageModel("title"),
      system: `\n
            - you will generate a short title based on the first message a user begins a conversation with
            - ensure it is not more than 20 characters long
            - the title should be a summary of the user's message
            - do not use quotes or colons`,
      prompt: JSON.stringify(message),
    });

    return result.text;
  } catch (error) {
    console.warn("error generating title from user message, using default title");
    return "New Chat";
  }
}

export const generateContent = async (file: Blob, provider: InternalProvider, mapString?: string) => {
  try {
    let messages: Array<ModelMessage> = [];
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "Extract all visible data needed to generate an official report card.",
            "",
            "Mapping Data:",
            mapString || "",
          ].join("\n"),
        },
        {
          type: "file",
          data: await file.arrayBuffer(),
          mediaType: file.type,
        },
      ],
    });

    const result = await generateText({
      model: provider.languageModel("vision"),
      system: legacyExtractPrompt,
      messages,
    });

    const raw = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    return { success: true, content: raw };
  } catch (e) {
    console.error("Failed to extract content", e);
    return { success: false, message: "Failed to extract content" };
  }
};

/**
 * Orchestrates a Two-Pass OCR extraction:
 * Pass 1: High-fidelity transcription using mistral-ocr-latest.
 * Pass 2: Schema-first mapping using a reasoning model (Llama 3.3 70B).
 * Fallback: Single-pass vision extraction using NVIDIA NIM.
 */
export async function runTwoPassExtraction({
  file,
  userId,
  mappingIndex,
  existingOcrText,
  schema,
}: {
  file: Blob;
  userId: number;
  mappingIndex: string;
  existingOcrText?: string;
  schema: z.ZodType<ResultInput>;
}): Promise<ExtractionResult> {
  const { provider: ocrProvider } = await resolveProviderForTask(userId, "ocr");
  const { provider: mapperProvider } = await resolveProviderForTask(userId, "chat");
  const { provider: fallbackProvider } = await resolveProviderForTask(userId, "vision");

  let ocrText = existingOcrText;

  // --- Pass 1: Transcription ---
  if (!ocrText) {
    try {
      const { text } = await generateText({
        model: ocrProvider.languageModel("ocr"),
        system: OCR_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                data: await file.arrayBuffer(),
                mediaType: file.type,
              },
            ],
          },
        ],
      });
      ocrText = text;
    } catch (error) {
      console.warn("OCR Pass 1 failed, attempting single-pass fallback", error);
      return await runFallbackExtraction(file, fallbackProvider, mappingIndex, schema);
    }
  }

  // --- Pass 2: Mapping ---
  try {
    const { object } = await generateObject({
      model: mapperProvider.languageModel("chat"),
      system: MAPPER_SYSTEM_PROMPT,
      schema,
      messages: [
        {
          role: "user",
          content: `OCR Transcription:\n${ocrText}\n\nMapping Data (Look up IDs here):\n${mappingIndex}`,
        },
      ],
    });

    return {
      success: true,
      data: object,
      rawText: ocrText,
      isFallback: false,
    };
  } catch (error) {
    console.warn("Mapping Pass 2 failed, attempting single-pass fallback", error);
    return await runFallbackExtraction(file, fallbackProvider, mappingIndex, schema);
  }
}

/**
 * Specialized fallback using a single-pass vision model (NVIDIA NIM).
 */
async function runFallbackExtraction(
  file: Blob,
  provider: InternalProvider,
  mappingIndex: string,
  schema: z.ZodType<any>
): Promise<ExtractionResult> {
  try {
    const { object } = await generateObject({
      model: provider.languageModel("vision"),
      system: legacyExtractPrompt,
      schema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract data using this mapping context:\n${mappingIndex}`,
            },
            {
              type: "file",
              data: await file.arrayBuffer(),
              mediaType: file.type,
            },
          ],
        },
      ],
    });

    return {
      success: true,
      data: object,
      isFallback: true,
    };
  } catch (error) {
    console.error("Critical: Fallback extraction failed", error);
    return {
      success: false,
      error: "All extraction attempts failed",
    };
  }
}
