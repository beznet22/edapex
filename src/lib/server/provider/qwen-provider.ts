/**
 * QwenCode OAuth2 Provider Implementation
 */

import crypto from "crypto";
import {
  CredentialType,
  type ProviderConfig,
  type Credential,
  type OAuth2Client,
  type ClientEvent,
  type DeviceAuth,
} from "$lib/schema/chat-schema";
import { qwenConfig } from "$lib/server/config";
import { cookies, jwt } from "$lib/server/helpers";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
  type LanguageModel,
  type Provider,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Cookies } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export class TokenRevokedError extends Error {
  constructor(message = "Refresh token revoked/invalid") {
    super(message);
    this.name = "TokenRevokedError";
  }
}

export class QwenProvider implements OAuth2Client {
  readonly type = CredentialType.QWEN_CODE;
  readonly config: ProviderConfig = qwenConfig;
  private credentials: Promise<Credential> | null = null;

  constructor() {
    const { cookies } = getRequestEvent();
    const token = cookies.get(this.type);
    console.log(`[QwenProvider] Cookie '${this.type}' present:`, !!token);
    this.credentials = token ? (jwt.verify(token) as Promise<Credential>) : null;
  }

  async getAccessToken(): Promise<{ accessToken: string; endpoint: string } | null> {
    const credentials = await this.credentials;
    if (!credentials) {
      console.log("❌ [QwenProvider] No credentials found in constructor");
      return null;
    }

    const { refresh_token, access_token: accessToken } = credentials;
    const endpoint = this.getCurrentEndpoint(credentials);

    if (!this.validateCredentials(credentials)) {
      const credential = await this.refreshAccessToken(refresh_token!);
      await this.setCredentials(credential);
      const { access_token: accessToken } = credential;
      return { accessToken, endpoint };
    }

    return { accessToken, endpoint };
  }

  async getToken(
    code: string,
    verifier: string
  ): Promise<Credential | { status: string; slowDown?: boolean }> {
    const result = await this.pollDevicToken(code, verifier);
    if ("status" in result && result.status === "pending") {
      return { ...result };
    }

    await this.setCredentials(result as Credential);
    return result as Credential;
  }

  async generateAuthUrl(): Promise<DeviceAuth | null> {
    const { codeChallenge, codeVerifier } = await this.generateCodeVerifierAsync();
    try {
      console.log("[QwenProvider] Requesting device authorization with codeChallenge:", codeChallenge);
      const deviceAuth = await this.requestDeviceAuthorization(codeChallenge);
      console.log("[QwenProvider] Device authorization received:", deviceAuth);
      const verifier = {
        code: deviceAuth.device_code,
        verifier: codeVerifier,
        expires_in: deviceAuth.expires_in,
      };
      this.setDeviceCode(verifier);
      return {
        authUrl: deviceAuth.verification_uri_complete,
        device_code: deviceAuth.device_code,
        interval: deviceAuth.interval,
        expires_in: deviceAuth.expires_in,
      };
    } catch (error) {
      console.error("❌ [QwenProvider] user code authentication failed:", error);
      return null;
    }
  }

  private setDeviceCode(verifier: any): void {
    const { cookies } = getRequestEvent();
    const expiresMs = Date.now() + verifier.expires_in * 1000;
    cookies.set(`v_${this.type}`, JSON.stringify(verifier), {
      expires: new Date(expiresMs),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  private async setCredentials(credential: any) {
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

  async getModelProvider(): Promise<Provider | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    const { accessToken, endpoint } = token;

    const openai = createOpenAICompatible({
      name: this.type,
      apiKey: accessToken,
      baseURL: endpoint,
      headers: this.getBaseHeaders(),
    });

    return customProvider({
      languageModels: {
        "coder-model": openai("qwen3-coder-plus"),
        "vision-model": openai("vision-model"),
        "chat-model": openai("qwen3-coder-flash"),
        "chat-model-reasoning": wrapLanguageModel({
          model: openai("qwen3-coder-plus"),
          middleware: extractReasoningMiddleware({ tagName: "think" }),
        }),
        "title-model": openai("qwen3-coder-flash"),
        "artifact-model": openai("qwen3-coder-flash"),
      },
      // textEmbeddingModels: {
      //   "text-embedding": openai("text-embedding-v4"),
      // },
    });
  }

  private getCurrentEndpoint(credentials: Credential): string {
    const baseEndpoint = credentials?.resource_url || qwenConfig.baseUrl || DEFAULT_BASE_URL;
    const suffix = "/v1";

    const normalizedUrl = baseEndpoint.startsWith("http") ? baseEndpoint : `https://${baseEndpoint}`;
    return normalizedUrl.endsWith(suffix) ? normalizedUrl : `${normalizedUrl}${suffix}`;
  }

  private async generateCodeVerifierAsync(): Promise<{ codeChallenge: string; codeVerifier: string }> {
    const codeVerifier = crypto.randomBytes(32).toString("base64url");

    const hash = crypto.createHash("sha256");
    hash.update(codeVerifier);
    const codeChallenge = hash.digest("base64url");
    return { codeChallenge, codeVerifier };
  }

  private async validateCredentials(credentials: Credential): Promise<boolean> {
    if (!credentials.expires_in || !credentials.obtained_at) {
      return false;
    }

    const expiresDate = credentials.obtained_at + credentials.expires_in * 1000;
    return this.isTokenValid(expiresDate);
  }

  private getBaseHeaders(): Record<string, string> {
    const version = "0.0.5";
    const userAgent = `QwenCode/${version} (${process.platform}; ${process.arch})`;
    return {
      "User-Agent": userAgent,
      Accept: "application/json",
      "X-DashScope-UserAgent": userAgent,
      "X-DashScope-CacheControl": "enable",
      "X-DashScope-AuthType": "qwen_oauth",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
      "Accept-Encoding": "gzip, deflate, br",
    };
  }

  private objectToUrlEncoded(obj: Record<string, any>): string {
    return new URLSearchParams(obj).toString();
  }

  private async requestDeviceAuthorization(code_challenge: string) {
    const bodyData = {
      client_id: this.config.clientId,
      scope: this.config.scopes.join(" "),
      code_challenge,
      code_challenge_method: "S256",
    };

    console.log(`[QwenProvider] POST ${this.config.deviceCodeUrl}`);
    console.log("[QwenProvider] Request body:", bodyData);

    const response = await fetch(this.config.deviceCodeUrl!, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "x-request-id": crypto.randomUUID(),
      },
      body: this.objectToUrlEncoded(bodyData),
    });

    console.log(`[QwenProvider] Response status: ${response.status} ${response.statusText}`);

    const responseText = await response.text();
    console.log("[QwenProvider] Raw response body:", responseText);

    if (!response.ok) {
      console.error(`❌ [QwenProvider] Device authorization failed: ${response.status} ${responseText}`);
      throw new Error(`Device authorization failed: ${response.status} ${response.statusText}`);
    }

    try {
      return JSON.parse(responseText);
    } catch (e) {
      console.error("❌ [QwenProvider] Failed to parse device authorization response as JSON:", e);
      throw new Error("Failed to parse device authorization response as JSON");
    }
  }

  private async pollDevicToken(
    device_code: string,
    code_verifier: string
  ): Promise<Credential | { status: string; slowDown?: boolean }> {
    const bodyData = {
      grant_type: qwenConfig.grantType || DEFAULT_GRANT_TYPE,
      client_id: this.config.clientId,
      device_code,
      code_verifier,
    };

    console.log(`[QwenProvider] POST ${this.config.tokenUrl}`);
    console.log("[QwenProvider] Poll body:", bodyData);

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: this.objectToUrlEncoded(bodyData),
    });

    console.log(`[QwenProvider] Poll response status: ${response.status}`);

    const responseText = await response.text();
    console.log("[QwenProvider] Poll raw response body:", responseText);

    if (!response.ok) {
      let errorData: any = {};
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        console.warn("[QwenProvider] Could not parse error response as JSON");
      }
      console.warn("[QwenProvider] Poll error data:", errorData);

      if (response.status === 400 && errorData.error === "authorization_pending") {
        return { status: "pending" };
      }

      if (response.status === 429 && errorData.error === "slow_down") {
        return { status: "pending", slowDown: true };
      }

      console.error(`❌ [QwenProvider] Credential poll failed: ${errorData.error || "Unknown error"}`);
      throw new Error(`Credential poll failed: ${errorData.error || "Unknown error"}`);
    }

    try {
      const credentialData = JSON.parse(responseText);
      credentialData.obtained_at = Date.now();
      return credentialData;
    } catch (e) {
      console.error("❌ [QwenProvider] Failed to parse poll response as JSON:", e);
      throw new Error("Failed to parse poll response as JSON");
    }
  }

  private async doRefresh(refresh_credential: string): Promise<Credential> {
    const bodyData = {
      grant_type: "refresh_credential",
      client_id: this.config.clientId,
      refresh_credential,
    };

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: this.objectToUrlEncoded(bodyData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Credential refresh failed: ${errorData.error || "Unknown error"}`);
    }

    const credentialData = await response.json();
    credentialData.obtained_at = Date.now();

    if (credentialData.access_credential) return credentialData as Credential;

    const errCode = credentialData?.error;
    if (response.status === 400 || response.status === 401) {
      if (errCode === "invalid_grant" || errCode === "invalid_request") {
        throw new Error(
          `Refresh Credential invalid: ${credentialData?.error_description ?? "Invalid refresh Credential"}`
        );
      }
      throw new Error(`Transient error: ${credentialData?.error_description ?? "Transient 4xx error"}`);
    }
    throw new Error(`Unexpected status ${response.status}`);
  }

  private async refreshAccessToken(refreshToken: string): Promise<Credential> {
    const MAX_RETRIES = 2;
    let backoff = 250;
    for (let i = 0; i <= MAX_RETRIES; i++) {
      try {
        return await this.doRefresh(refreshToken);
      } catch (e) {
        if (e instanceof TokenRevokedError) throw e;
        if (i === MAX_RETRIES) throw e;
        await new Promise((r) => setTimeout(r, backoff));
        backoff *= 2;
      }
    }
    throw new Error("Max retries exceeded");
  }

  private isTokenValid(expiresDate: number): boolean {
    // Add a buffer to avoid race conditions
    const credential_REFRESH_BUFFER_MS = 30 * 1000; // 30 seconds
    return Date.now() < expiresDate - credential_REFRESH_BUFFER_MS;
  }
}
