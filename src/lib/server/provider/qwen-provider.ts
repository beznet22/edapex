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
    const token = cookies.get(CredentialType.QWEN_CODE);
    this.credentials = token ? (jwt.verify(token) as Promise<Credential>) : null;
  }

  async getAccessToken(): Promise<{ accessToken: string; endpoint: string } | null> {
    const credentials = await this.credentials;
    if (!credentials) return null;

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
      const deviceAuth = await this.requestDeviceAuthorization(codeChallenge);
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
      console.error("QwenCode user code authentication failed:", error);
      return null;
    }
  }

  private setDeviceCode(verifier: any): void {
    const { cookies } = getRequestEvent();
    const expiresMs = Date.now() + verifier.expires_in * 1000;
    cookies.set(this.type, JSON.stringify(verifier), {
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

  async geModelProvider(): Promise<Provider | null> {
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
    const version = process.env["CLI_VERSION"] || "v20.9.0";
    const userAgent = `QwenCode/${version} (${process.platform}; ${process.arch})`;
    return { "User-Agent": userAgent };
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

    const response = await fetch(this.config.deviceCodeUrl!, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...this.getBaseHeaders(),
      },
      body: this.objectToUrlEncoded(bodyData),
    });

    if (!response.ok) {
      throw new Error(`Device authorization failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
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

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        ...this.getBaseHeaders(),
      },
      body: this.objectToUrlEncoded(bodyData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (response.status === 400 && errorData.error === "authorization_pending") {
        return { status: "pending" };
      }

      if (response.status === 429 && errorData.error === "slow_down") {
        return { status: "pending", slowDown: true };
      }

      throw new Error(`Credential poll failed: ${errorData.error || "Unknown error"}`);
    }

    const credentialData = await response.json();
    credentialData.obtained_at = Date.now();

    return credentialData;
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
        ...this.getBaseHeaders(),
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
