/**
 * OpenRouter OAuth2 Provider Implementation (PKCE)
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
import { openRouterConfig } from "$lib/server/config";
import { jwt } from "$lib/server/helpers";
import {
  customProvider,
  type Provider,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getRequestEvent } from "$app/server";

export class OpenRouterProvider implements OAuth2Client {
  readonly type = CredentialType.OPENROUTER;
  readonly config: ProviderConfig = openRouterConfig;
  private readonly credentials: Promise<Credential> | null = null;

  constructor() {
    const { cookies } = getRequestEvent();
    const token = cookies.get(this.type);
    console.log(`[OpenRouterProvider] Cookie '${this.type}' present:`, !!token);
    this.credentials = token ? (jwt.verify(token) as Promise<Credential>) : null;
  }

  async getAccessToken(): Promise<{ accessToken: string; endpoint: string } | null> {
    const credentials = await this.credentials;
    if (!credentials || !credentials.access_token) {
      console.log("❌ [OpenRouterProvider] No credentials found");
      return null;
    }

    // OpenRouter keys are long-lived, so no refresh logic is typically needed here
    // unless the user manually revoked it.
    return {
      accessToken: credentials.access_token,
      endpoint: this.config.baseUrl || "https://openrouter.ai/api/v1",
    };
  }

  async getToken(
    state: string,
    verifier: string
  ): Promise<Credential | { status: string; slowDown?: boolean }> {
    const { cookies } = getRequestEvent();
    const authCode = cookies.get(`auth_code_${state}`);

    if (!authCode) {
      console.log(`[OpenRouterProvider] Auth code not found for state: ${state}`);
      return { status: "pending" };
    }

    try {
      console.log("[OpenRouterProvider] Exchanging code for API key...");
      const response = await fetch(this.config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: authCode,
          code_verifier: verifier,
          code_challenge_method: "S256",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [OpenRouterProvider] Token exchange failed: ${response.status} ${errorText}`);
        return { status: "error" };
      }

      const data = await response.json();
      if (!data.key) {
        console.error("❌ [OpenRouterProvider] No key returned in response:", data);
        return { status: "error" };
      }

      // Cleanup
      cookies.delete(`auth_code_${state}`, { path: "/" });

      const credential: Credential = {
        access_token: data.key,
        token_type: "Bearer",
        expires_in: 0, // Indicate long-lived/permanent
        obtained_at: Date.now(),
      };

      await this.setCredentials(credential);
      return credential;
    } catch (error) {
      console.error("❌ [OpenRouterProvider] Failed to get token:", error);
      return { status: "error" };
    }
  }

  async generateAuthUrl(): Promise<DeviceAuth | null> {
    const { codeChallenge, codeVerifier } = await this.generatePKCE();
    const event = getRequestEvent();
    try {
      const redirectUri = `${event.url.origin}/api/auth/callback/openrouter`;
      const state = crypto.randomBytes(16).toString("hex");

      const authUrl = new URL(this.config.authUrl);
      authUrl.searchParams.set("callback_url", redirectUri);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("state", state);

      this.setTempVerifier({
        code: state,
        verifier: codeVerifier,
        expires_in: 600, // 10 minutes
      });

      return {
        authUrl: authUrl.toString(),
        device_code: state,
        interval: 2,
        expires_in: 600,
      };
    } catch (error) {
      console.error("❌ [OpenRouterProvider] Failed to generate auth URL:", error);
      return null;
    }
  }

  private setTempVerifier(verifier: { code: string; verifier: string; expires_in: number }): void {
    const { cookies } = getRequestEvent();
    const expiresMs = Date.now() + verifier.expires_in * 1000;
    cookies.set(`v_${this.type}`, JSON.stringify(verifier), {
      expires: new Date(expiresMs),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  private async setCredentials(credential: Credential) {
    const { cookies } = getRequestEvent();
    // Use a large expiration for stable API keys (e.g., 1 year) if expires_in is 0
    const expiresIn = credential.expires_in || 31536000; 
    const { token, exp } = await jwt.sign(credential, expiresIn, undefined, true);
    cookies.set(this.type, token, {
      expires: new Date(exp * 1000),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  on(_event: ClientEvent, _callback: (tokens: Credential) => void): void {
    // Event handling not required for this simple implementation
  }

  getTokenInfo(_credential: string): Promise<unknown> {
    throw new Error("Not implemented");
  }

  async getModelProvider(): Promise<Provider | null> {
    const tokenData = await this.getAccessToken();
    if (!tokenData) return null;

    const openrouter = createOpenRouter({
      apiKey: tokenData.accessToken,
      headers: {
        "HTTP-Referer": "https://edapex.com", // Replace with actual domain in production
        "X-OpenRouter-Title": "EdApex",
      },
    });

    
    return customProvider({
      languageModels: {
        "chat-model": openrouter.chat("stepfun/step-3.5-flash:free"), // Default model
        "coder-model": openrouter.chat("stepfun/step-3.5-flash:free"),
        "vision-model": openrouter.chat("nvidia/nemotron-nano-12b-v2-vl:free"),
        "chat-model-reasoning": openrouter.chat("stepfun/step-3.5-flash:free"),
        "title-model": openrouter.chat("stepfun/step-3.5-flash:free"),
        "artifact-model": openrouter.chat("stepfun/step-3.5-flash:free"),
      },
    });
  }

  private async generatePKCE(): Promise<{ codeChallenge: string; codeVerifier: string }> {
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    return { codeChallenge: hash, codeVerifier };
  }
}
