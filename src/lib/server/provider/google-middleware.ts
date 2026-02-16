import { z } from "zod";
import { parseJsonEventStream, type ParseResult } from "@ai-sdk/provider-utils";
import { Readable } from "node:stream";
import { writeFileSync } from "node:fs";
import type { OAuth2Client as Client } from "google-auth-library";
import type {
    LanguageModelV3,
    LanguageModelV3CallOptions,
    LanguageModelV3GenerateResult,
    LanguageModelV3Middleware,
    LanguageModelV3StreamPart,
    LanguageModelV3StreamResult,
    LanguageModelV3Prompt,
    LanguageModelV3Content
} from "@ai-sdk/provider";

const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const CODE_ASSIST_API_VERSION = "v1internal";

const geminiResponseSchema = z.object({
    candidates: z.array(z.object({
        content: z.object({
            parts: z.array(z.object({
                text: z.string().optional(),
            })),
        }).optional(),
        finishReason: z.string().optional(),
    })).optional(),
    usageMetadata: z.object({
        promptTokenCount: z.number().optional(),
        candidatesTokenCount: z.number().optional(),
        totalTokenCount: z.number().optional(),
    }).optional(),
});

const chunkSchema = z.object({
    response: geminiResponseSchema.optional(),
});

export function createGoogleMiddleware(client: Client, projectId: string): LanguageModelV3Middleware {
    return {
        specificationVersion: 'v3',
        wrapGenerate: async ({ model, params }) => {
            return doGenerate(client, projectId, model, params);
        },
        wrapStream: async ({ model, params }) => {
            return doStream(client, projectId, model, params);
        },
    };
}

async function prepareRequestBody(
    projectId: string,
    modelId: string,
    options: LanguageModelV3CallOptions
) {
    // Map system instruction if present
    const systemPrompt = options.prompt.find((m) => m.role === "system");
    let systemInstruction: any = undefined;

    if (systemPrompt) {
        const parts: any[] = [];
        if (typeof systemPrompt.content === "string") {
            parts.push({ text: systemPrompt.content });
        } else {
            for (const part of systemPrompt.content as LanguageModelV3Content[]) {
                if (part.type === "text") {
                    parts.push({ text: part.text });
                }
            }
        }
        if (parts.length > 0) {
            // Internal API often expects specific format for system instructions
            systemInstruction = { role: "user", parts };
        }
    }

    const contents = convertPromptToGemini(options.prompt);

    const generationConfig: any = {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxOutputTokens || 8192,
    };

    if (options.topP != null) generationConfig.topP = options.topP;
    if (options.topK != null) generationConfig.topK = options.topK;
    if (options.stopSequences != null && options.stopSequences.length > 0) {
        generationConfig.stopSequences = options.stopSequences;
    }
    if (options.presencePenalty != null) {
        generationConfig.presencePenalty = options.presencePenalty;
    }
    if (options.frequencyPenalty != null) {
        generationConfig.frequencyPenalty = options.frequencyPenalty;
    }
    if (options.seed != null) {
        generationConfig.seed = options.seed;
    }

    if (options.responseFormat?.type === "json") {
        generationConfig.responseMimeType = "application/json";
        if (options.responseFormat.schema) {
            generationConfig.responseSchema = options.responseFormat.schema;
        }
    }

    return {
        model: modelId,
        project: projectId,
        request: {
            systemInstruction,
            contents,
            generationConfig,
        },
    };
}

function convertPromptToGemini(prompt: LanguageModelV3Prompt): any[] {
    const contents: any[] = [];

    for (const message of prompt) {
        if (message.role === "system") continue;

        const role = message.role === "assistant" ? "model" : "user";
        const parts: any[] = [];

        if (typeof message.content === "string") {
            parts.push({ text: message.content });
        } else {
            for (const part of message.content) {
                switch (part.type) {
                    case "text":
                        parts.push({ text: part.text });
                        break;
                    case "file":
                        if (role === "model") continue;
                        const mimeType = part.mediaType || "application/octet-stream";
                        let base64Data: string;

                        if (typeof part.data === "string") {
                            base64Data = part.data;
                        } else if (part.data instanceof Uint8Array || Buffer.isBuffer(part.data)) {
                            base64Data = Buffer.from(part.data).toString("base64");
                        } else if (part.data instanceof ArrayBuffer) {
                            base64Data = Buffer.from(part.data).toString("base64");
                        } else {
                            console.warn("[GoogleMiddleware] Unsupported data type for file part:", typeof part.data);
                            continue;
                        }

                        parts.push({
                            inlineData: { mimeType, data: base64Data },
                        });
                        break;
                    case "tool-call":
                        parts.push({
                            functionCall: {
                                name: part.toolName,
                                args: (part.input || {}) as Record<string, unknown>,
                            },
                        });
                        break;
                    case "tool-result":
                        let resultValue: Record<string, unknown>;
                        const output = part.output;
                        if (output.type === "text" || output.type === "error-text") {
                            resultValue = { result: output.value };
                        } else if (output.type === "json" || output.type === "error-json") {
                            const jsonValue = output.value;
                            if (jsonValue !== null && typeof jsonValue === "object" && !Array.isArray(jsonValue)) {
                                resultValue = jsonValue as Record<string, unknown>;
                            } else {
                                resultValue = { result: jsonValue };
                            }
                        } else if (output.type === "execution-denied") {
                            resultValue = { result: `[Execution denied${output.reason ? `: ${output.reason}` : ""}]` };
                        } else if (output.type === "content") {
                            resultValue = {
                                result: output.value
                                    .filter((p: any) => p.type === "text")
                                    .map((p: any) => p.text)
                                    .join("\n"),
                            };
                        } else {
                            resultValue = { result: "[Unknown output type]" };
                        }

                        parts.push({
                            functionResponse: {
                                name: part.toolName,
                                response: resultValue,
                            },
                        });
                        break;
                }
            }
        }

        contents.push({ role, parts });
    }

    return contents;
}

async function doGenerate(
    client: Client,
    projectId: string,
    model: LanguageModelV3,
    options: LanguageModelV3CallOptions
): Promise<LanguageModelV3GenerateResult> {
    const requestBody = await prepareRequestBody(projectId, model.modelId, options);

    console.log(`[GoogleMiddleware] Sending generateContent request for model: ${model.modelId}`);

    try {
        const response = await client.request({
            url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:generateContent`,
            method: "POST",
            params: { alt: "json" },
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-client": `edapex-ai/v0.0.1`,
            },
            body: JSON.stringify(requestBody), // Switched back to 'body' with stringify
        });

        const data = response.data as any;

        // Verbose logging for debugging
        const debugData = {
            timestamp: new Date().toISOString(),
            modelId: model.modelId,
            request: requestBody,
            response: data
        };
        writeFileSync("google_debug.json", JSON.stringify(debugData, null, 2));
        console.log("[GoogleMiddleware] generateContent successful. Debug logged to google_debug.json");

        const responseData = data?.response ? data.response : data;
        const candidates = responseData?.candidates || [];
        const firstCandidate = candidates[0];
        let text = firstCandidate?.content?.parts?.[0]?.text ?? "";

        // Strip markdown code blocks if present
        if (text.startsWith("```")) {
            text = text.replace(/^```[a-z]*\n/i, "").replace(/\n```$/, "");
        }

        const usageMetadata = responseData?.usageMetadata || {};

        return {
            content: [{ type: 'text', text }],
            usage: {
                inputTokens: {
                    total: usageMetadata.promptTokenCount ?? 0,
                    noCache: undefined,
                    cacheRead: undefined,
                    cacheWrite: undefined
                },
                outputTokens: {
                    total: usageMetadata.candidatesTokenCount ?? 0,
                    text: undefined,
                    reasoning: undefined
                },
            },
            finishReason: (firstCandidate?.finishReason?.toLowerCase() as any) || "unknown",
            request: { body: JSON.stringify(requestBody) },
            response: {
                id: "gen-" + Date.now(),
                modelId: model.modelId,
                headers: Object.fromEntries(response.headers as any),
                body: JSON.stringify(data),
            },
            warnings: [],
        };
    } catch (error: any) {
        const errorData = {
            timestamp: new Date().toISOString(),
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            request: {
                url: error.config?.url,
                method: error.config?.method,
                headers: error.config?.headers,
                data: requestBody,
            }
        };
        writeFileSync("google_error.json", JSON.stringify(errorData, null, 2));
        console.error("[GoogleMiddleware] generateContent failed. Error logged to google_error.json");
        throw error;
    }
}

async function doStream(
    client: Client,
    projectId: string,
    model: LanguageModelV3,
    options: LanguageModelV3CallOptions
): Promise<LanguageModelV3StreamResult> {
    const requestBody = await prepareRequestBody(projectId, model.modelId, options);

    console.log(`[GoogleMiddleware] Sending streamGenerateContent request for model: ${model.modelId}`);

    try {
        const response = await client.request({
            url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:streamGenerateContent`,
            method: "POST",
            params: { alt: "sse" },
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-client": `edapex-ai/v0.0.1`,
            },
            responseType: "stream",
            body: JSON.stringify(requestBody), // Switched back to 'body' with stringify
        });

        const nodeStream = response.data as Readable;

        // Verbose logging for debugging (streaming is harder to log full response, but we log the request)
        const debugData = {
            timestamp: new Date().toISOString(),
            modelId: model.modelId,
            request: requestBody,
            type: "stream"
        };
        writeFileSync("google_debug_stream.json", JSON.stringify(debugData, null, 2));
        console.log("[GoogleMiddleware] streamGenerateContent started. Request logged to google_debug_stream.json");

        const webStream = Readable.toWeb(nodeStream);
        const parsedStream = parseJsonEventStream({
            stream: webStream as ReadableStream<Uint8Array>,
            schema: chunkSchema,
        });

        let isFirstChunk = true;
        let finishReason: string = "unknown";
        let usage = {
            inputTokens: { total: 0, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 0, text: undefined, reasoning: undefined }
        };

        const transformer = new TransformStream<ParseResult<z.infer<typeof chunkSchema>>, LanguageModelV3StreamPart>({
            start(controller) {
                controller.enqueue({ type: 'stream-start', warnings: [] });
            },
            transform(chunk, controller) {
                if (!chunk.success) {
                    controller.enqueue({ type: 'error', error: chunk.error });
                    return;
                }

                const rawData = chunk.value.response;
                if (!rawData) return;

                const data = (rawData as any).response ? (rawData as any).response : rawData;

                if (isFirstChunk) {
                    isFirstChunk = false;
                    controller.enqueue({
                        type: 'response-metadata',
                        id: "gen-" + Date.now(),
                        modelId: model.modelId,
                    });
                    controller.enqueue({ type: 'text-start', id: '0' });
                }

                const candidate = data.candidates?.[0];
                if (candidate?.content?.parts?.[0]?.text) {
                    controller.enqueue({
                        type: 'text-delta',
                        id: '0',
                        delta: candidate.content.parts[0].text,
                    });
                }

                if (candidate?.finishReason) {
                    finishReason = candidate.finishReason.toLowerCase();
                }

                if (data.usageMetadata) {
                    usage = {
                        inputTokens: {
                            total: data.usageMetadata.promptTokenCount ?? usage.inputTokens.total,
                            noCache: undefined,
                            cacheRead: undefined,
                            cacheWrite: undefined
                        },
                        outputTokens: {
                            total: data.usageMetadata.candidatesTokenCount ?? usage.outputTokens.total,
                            text: undefined,
                            reasoning: undefined
                        },
                    };
                }
            },
            flush(controller) {
                if (!isFirstChunk) {
                    controller.enqueue({ type: 'text-end', id: '0' });
                }
                controller.enqueue({
                    type: 'finish',
                    finishReason: finishReason as any,
                    usage,
                });
            },
        });

        return {
            stream: parsedStream.pipeThrough(transformer),
            request: { body: JSON.stringify(requestBody) },
            response: {
                headers: Object.fromEntries(response.headers as any),
            },
        };
    } catch (error: any) {
        const errorData = {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            request: {
                url: error.config?.url,
                method: error.config?.method,
                headers: error.config?.headers,
                data: requestBody,
            }
        };
        writeFileSync("google_error.json", JSON.stringify(errorData, null, 2));
        console.error("[GoogleMiddleware] streamGenerateContent failed. Error logged to google_error.json");
        throw error;
    }
}
