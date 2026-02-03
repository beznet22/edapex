/**
 * Google OAuth2 Provider Implementation using google-auth-library
 */

import crypto from "crypto";
import { OAuth2Client as Client, CodeChallengeMethod } from "google-auth-library";

import {
  CredentialType,
  type ClientEvent,
  type Credential,
  type DeviceAuth,
  type OAuth2Client,
  type ProviderConfig,
} from "$lib/schema/chat-schema";
import { googleConfig } from "$lib/server/config";
import { cookies, jwt } from "$lib/server/helpers";
import { getRequestEvent } from "$app/server";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { customProvider, wrapLanguageModel, extractReasoningMiddleware, type Provider } from "ai";
import { z } from "zod";
import { parseJsonEventStream, type ParseResult } from "@ai-sdk/provider-utils";
import { Readable } from "node:stream";
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

const COOKIE_GRACE_SEC = 60; // 1 minute buffer: Grace period
const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com"
const CODE_ASSIST_API_VERSION = "v1internal"

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

export class GoogleProvider implements OAuth2Client {
  readonly type = CredentialType.GOOGLE_OAUTH;
  readonly config: ProviderConfig;
  readonly credentials: Promise<Credential> | null;
  private client: Client | null = null;
  private projectId: string | null = null;
  private authInitialized: boolean = false;

  constructor() {
    this.config = googleConfig;

    const { cookies, url } = getRequestEvent();
    const token = cookies.get(this.type);
    console.log(`[GoogleProvider] Cookie '${this.type}' present:`, !!token);
    this.credentials = token ? (jwt.verify(token) as Promise<Credential>) : null;

    this.client = new Client({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: `${url.origin}/api/auth/callback/google_oauth`,
    });
  }

  async getAccessToken(): Promise<{ accessToken: string; endpoint?: string } | null> {
    const credentials = await this.credentials;
    if (!credentials) {
      console.log("❌ [GoogleProvider] No credentials found in constructor");
      return null;
    }

    let currentCredentials = credentials;

    if (!this.validateCredentials(currentCredentials)) {
      if (currentCredentials.refresh_token) {
        currentCredentials = await this.refreshToken(currentCredentials);
        await this.setCredentials(currentCredentials);
      } else {
        return null;
      }
    }

    // Ensure the client state is synchronized
    this.client!.setCredentials({
      access_token: currentCredentials.access_token,
      refresh_token: currentCredentials.refresh_token,
      expiry_date: currentCredentials.obtained_at! + currentCredentials.expires_in! * 1000,
    });

    return { accessToken: currentCredentials.access_token };
  }

  async getToken(
    state: string,
    codeVerifier: string
  ): Promise<Credential | { status: string; slowDown?: boolean }> {
    if (!this.client) return { status: "error" };

    const { cookies } = getRequestEvent();
    const authCode = cookies.get(`auth_code_${state}`);

    if (!authCode) {
      return { status: "pending" };
    }

    try {
      // Exchange code for Credentials using google-auth-library
      const { tokens } = await this.client.getToken({
        code: authCode,
        codeVerifier,
      });

      this.client.setCredentials(tokens);
      const credential = {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token || "",
        expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
        token_type: "Bearer",
        obtained_at: Date.now(),
      };
      await this.setCredentials(credential);
      // Clean up temporary code cookie
      cookies.delete(`auth_code_${state}`, { path: "/" });
      return credential;
    } catch (error) {
      console.error("Failed to authenticate with authorization code:", error);
      return { status: "error" };
    }
  }

  private async setCredentials(credential: Credential): Promise<void> {
    const { cookies } = getRequestEvent();
    const { token, exp } = await jwt.sign(credential, credential.expires_in, undefined, true);
    cookies.set(this.type, token, {
      expires: new Date(exp * 1000),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  on(event: ClientEvent, callback: (tokens: Credential) => void): void {
    throw new Error("Not implemented");
  }

  getTokenInfo(credential: string): Promise<any> {
    throw new Error("Not implemented");
  }

  async generateAuthUrl(): Promise<DeviceAuth | null> {
    if (!this.client) return null;
    const event = getRequestEvent();
    try {
      const redirectUri = `${event.url.origin}/api/auth/callback/google_oauth`;
      const codeVerifier = await this.client.generateCodeVerifierAsync();
      const state = crypto.randomBytes(32).toString("hex");

      // Generate auth URL using google-auth-library
      const authUrl = this.client.generateAuthUrl({
        redirect_uri: redirectUri,
        access_type: "offline",
        scope: this.config.scopes,
        code_challenge_method: CodeChallengeMethod.S256,
        code_challenge: codeVerifier.codeChallenge,
        state,
      });

      cookies.set(
        `v_${this.type}`,
        JSON.stringify({ code: state, verifier: codeVerifier.codeVerifier }),
        Math.floor(Date.now() / 1000) + 3600
      );
      return { authUrl, device_code: state, interval: 2, expires_in: 3600 };
    } catch (error) {
      console.error("Google user code authentication failed:", error);
      return null;
    }
  }

  async getModelProvider(): Promise<Provider | null> {
    const tokenData = await this.getAccessToken();
    if (!tokenData) {
      console.log("❌ [GoogleProvider] Failed to get access token");
      return null;
    }
    const { accessToken } = tokenData;

    // We use createOpenAICompatible as a base, then wrap with middleware
    const gemini = createOpenAICompatible({
      name: "google-gemini",
      apiKey: accessToken,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    });

    // Eagerly discover/cache project ID while we are still in a valid cookie-setting context
    await this.discoverProjectId();

    const wrapModel = (model: any) =>
      wrapLanguageModel({
        model: model,
        middleware: this.completionMiddleware() as any,
      });

    return customProvider({
      languageModels: {
        "coder-model": wrapModel(gemini("gemini-3-pro-preview")),
        "vision-model": wrapModel(gemini("gemini-3-flash-preview")),
        "chat-model": wrapModel(gemini("gemini-3-flash-preview")),
        "chat-model-reasoning": wrapModel(gemini("gemini-3-pro-preview")),
        "title-model": wrapModel(gemini("gemini-1.5-pro")),
        "artifact-model": wrapModel(gemini("gemini-1.5-pro")),
        "image-model": wrapModel(gemini("gemini-3-pro-image-preview")),
      },
    });
  }

  async fetchUserInfo(client: Client): Promise<{ email: string;[key: string]: any } | null> {
    try {
      const response = await client.request({
        url: this.config.userInfoUrl!,
        method: "GET",
      });

      if (response.status !== 200) {
        console.log("Failed to fetch user info:", response.status, response.statusText);
        return null;
      }

      return response.data as any;
    } catch (error) {
      console.log("Error retrieving user info:", error);
      return null;
    }
  }

  async refreshToken(credential: Credential): Promise<Credential> {
    try {
      // Set refresh Credential and get new Credential using existing client
      this.client!.setCredentials({
        access_token: credential.access_token,
        refresh_token: credential.refresh_token,
      });

      const { credentials } = await this.client!.refreshAccessToken();

      return {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || credential.refresh_token,
        expires_in: credentials.expiry_date
          ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
          : 3600,
        token_type: "Bearer",
        obtained_at: Date.now(),
      };
    } catch (error) {
      throw new Error(`Credential refresh failed: ${error}`);
    }
  }

  async validateCredentials(Credential: Credential): Promise<boolean> {
    if (!Credential.expires_in || !Credential.obtained_at) {
      return false;
    }

    const expiresDate = Credential.obtained_at + Credential.expires_in * 1000;
    return this.isCredentialValid(expiresDate);
  }

  private isCredentialValid(expiresDate: number): boolean {
    // Add a buffer to avoid race conditions
    const Credential_REFRESH_BUFFER_MS = 30 * 1000; // 30 seconds
    return Date.now() < expiresDate - Credential_REFRESH_BUFFER_MS;
  }

  /**
   * Discover or retrieve the project ID
   */
  private async discoverProjectId(): Promise<string> {
    if (this.projectId) return this.projectId;

    const credentials = await this.credentials;
    if (credentials?.project_id) {
      this.projectId = credentials.project_id;
      return this.projectId;
    }

    const initialProjectId = "default";
    const clientMetadata = {
      ideType: "IDE_UNSPECIFIED",
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
      duetProject: initialProjectId,
    };

    try {
      const loadResponse = await this.loadCodeAssist(initialProjectId, clientMetadata);
      if (loadResponse.cloudaicompanionProject) {
        this.projectId = loadResponse.cloudaicompanionProject;
      } else {
        const defaultTier = loadResponse.allowedTiers?.find((tier: any) => tier.isDefault);
        const tierId = defaultTier?.id || "free-tier";
        let lroResponse = await this.onboardUser(tierId, initialProjectId, clientMetadata);

        while (!lroResponse.done) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          lroResponse = await this.onboardUser(tierId, initialProjectId, clientMetadata);
        }

        this.projectId = lroResponse.response?.cloudaicompanionProject?.id || initialProjectId;
      }

      if (this.projectId && credentials) {
        await this.setCredentials({ ...credentials, project_id: this.projectId });
      }

      return this.projectId!;
    } catch (error) {
      console.error("Failed to discover project ID:", error);
      throw error;
    }
  }

  private async loadCodeAssist(projectId: string, metadata: any) {
    const response = await this.client!.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:loadCodeAssist`,
      method: "POST",
      body: JSON.stringify({
        cloudaicompanionProject: projectId,
        metadata,
      }),
    });
    return response.data as any;
  }

  private async onboardUser(tierId: string, projectId: string, metadata: any) {
    const response = await this.client!.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:onboardUser`,
      method: "POST",
      body: JSON.stringify({
        tierId,
        cloudaicompanionProject: projectId,
        metadata,
      }),
    });
    return response.data as any;
  }

  private convertPromptToGemini(prompt: LanguageModelV3Prompt): any[] {
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
              } else if (part.data instanceof Uint8Array) {
                base64Data = Buffer.from(part.data).toString("base64");
              } else if (part.data instanceof ArrayBuffer) {
                base64Data = Buffer.from(part.data).toString("base64");
              } else {
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

  private completionMiddleware(): LanguageModelV3Middleware {
    return {
      specificationVersion: 'v3',
      wrapGenerate: async ({ model, params }) => {
        return this.doGenerate(model, params);
      },
      wrapStream: async ({ model, params }) => {
        return this.doStream(model, params);
      },
    };
  }

  private async prepareRequestBody(
    modelId: string,
    options: LanguageModelV3CallOptions
  ) {
    const projectId = await this.discoverProjectId();

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
        systemInstruction = { role: "user", parts };
      }
    }

    const contents = this.convertPromptToGemini(options.prompt);

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

  private async doGenerate(
    model: LanguageModelV3,
    options: LanguageModelV3CallOptions
  ): Promise<LanguageModelV3GenerateResult> {
    const requestBody = await this.prepareRequestBody(model.modelId, options);

    const response = await this.client!.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:generateContent`,
      method: "POST",
      params: { alt: "json" },
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-client": `edapex-ai/v0.0.1`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = response.data as any;
    const candidates = data?.candidates || [];
    const firstCandidate = candidates[0];
    const text = firstCandidate?.content?.parts?.[0]?.text ?? "";
    const usageMetadata = data?.usageMetadata || {};

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
  }

  private async doStream(
    model: LanguageModelV3,
    options: LanguageModelV3CallOptions
  ): Promise<LanguageModelV3StreamResult> {
    const requestBody = await this.prepareRequestBody(model.modelId, options);

    const response = await this.client!.request({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:streamGenerateContent`,
      method: "POST",
      params: { alt: "sse" },
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-client": `edapex-ai/v0.0.1`,
      },
      responseType: "stream",
      body: JSON.stringify(requestBody),
    });

    const nodeStream = response.data as Readable;
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

        const data = chunk.value.response;
        if (!data) return;

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
  }

}
