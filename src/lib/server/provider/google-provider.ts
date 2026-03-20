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
import { jwt } from "$lib/server/helpers";
import { getRequestEvent } from "$app/server";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { customProvider, wrapLanguageModel, type Provider } from "ai";
import { createGoogleMiddleware } from "./google-middleware";

const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const CODE_ASSIST_API_VERSION = "v1internal";

export class GoogleProvider implements OAuth2Client {
  readonly type = CredentialType.GOOGLE_OAUTH;
  readonly config: ProviderConfig;
  readonly credentials: Promise<Credential> | null;
  private client: Client;
  private projectId: string | null = null;

  constructor() {
    this.config = googleConfig;

    const { cookies } = getRequestEvent();
    const token = cookies.get(this.type);
    console.log(`[GoogleProvider] Cookie '${this.type}' present:`, !!token);
    this.credentials = token ? (jwt.verify(token) as Promise<Credential>) : null;

    this.client = new Client({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
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

    if (!this.client) {
        throw new Error("Client not initialized");
    }
    this.client.setCredentials({
      access_token: currentCredentials.access_token,
      refresh_token: currentCredentials.refresh_token,
      expiry_date: (currentCredentials.obtained_at ?? 0) + (currentCredentials.expires_in ?? 0) * 1000,
    });

    return { accessToken: currentCredentials.access_token };
  }

  async getToken(
    code: string,
    verifier: string
  ): Promise<Credential | { status: string; slowDown?: boolean }> {
    const { cookies } = getRequestEvent();
    const verifierData = cookies.get(`v_${this.type}`);
    
    if (!verifierData) {
      console.error("❌ [GoogleProvider] No verifier found in cookies");
      return { status: "error" };
    }

    const { code: savedState } = JSON.parse(verifierData);

    // If the code is the same as the saved state, the user hasn't entered the manual code yet (polling)
    if (code === savedState) {
      return { status: "pending" };
    }

    try {
      const { tokens } = await this.client.getToken({
        code,
        codeVerifier: verifier,
        redirect_uri: this.config.redirectUri,
      });

      if (!tokens.access_token) {
        throw new Error("No access token returned from Google");
      }

      const credential: Credential = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || "",
        expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
        token_type: "Bearer",
        obtained_at: Date.now(),
      };

      await this.setCredentials(credential);
      cookies.delete(`v_${this.type}`, { path: "/" });
      return credential;
    } catch (error) {
      console.error("❌ [GoogleProvider] Token exchange failed:", error);
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
    try {
      console.log("[GoogleProvider] Generating PKCE auth URL...");
      
      const verifier = crypto.randomBytes(32).toString('hex');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      const state = crypto.randomBytes(32).toString("hex");

      this.setVerifier(state, verifier);

      const authUrl = this.client.generateAuthUrl({
        access_type: "offline",
        scope: this.config.scopes,
        code_challenge_method: CodeChallengeMethod.S256,
        code_challenge: challenge,
        state,
        redirect_uri: this.config.redirectUri,
      });

      return {
        authUrl,
        device_code: state,
        interval: 5, // Poll every 5 seconds
        expires_in: 3600,
      };
    } catch (error) {
      console.error("❌ [GoogleProvider] Auth URL generation failed:", error);
      return null;
    }
  }

  private setVerifier(state: string, verifier: string): void {
    const { cookies } = getRequestEvent();
    cookies.set(`v_${this.type}`, JSON.stringify({ code: state, verifier }), {
      expires: new Date(Date.now() + 3600 * 1000),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
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

    // Discovery/cache project ID
    const projectId = await this.discoverProjectId();

    const middleware = createGoogleMiddleware(this.client, projectId);

    const wrapModel = (model: Parameters<typeof wrapLanguageModel>[0]["model"]) =>
      wrapLanguageModel({
        model: model,
        middleware,
      });

    return customProvider({
      languageModels: {
        "coder-model": wrapModel(gemini("gemini-3-pro-preview")),
        "vision-model": wrapModel(gemini("gemini-3-pro-preview")),
        "chat-model": wrapModel(gemini("gemini-3-pro-preview")),
        "chat-model-reasoning": wrapModel(gemini("gemini-3-pro-preview")),
        "title-model": wrapModel(gemini("gemini-1.5-pro")),
        "artifact-model": wrapModel(gemini("gemini-1.5-pro")),
        "image-model": wrapModel(gemini("gemini-3-pro-image-preview")),
      },
    });
  }

  async fetchUserInfo(client: Client): Promise<{ email: string; [key: string]: unknown } | null> {
    try {
      const response = await client.request<{ email: string; [key: string]: unknown }>({
        url: this.config.userInfoUrl || "",
        method: "GET",
      });

      if (response.status !== 200) {
        console.log("Failed to fetch user info:", response.status, response.statusText);
        return null;
      }

      return response.data;
    } catch (error) {
      console.log("Error retrieving user info:", error);
      return null;
    }
  }

  async refreshToken(credential: Credential): Promise<Credential> {
    try {
      this.client.setCredentials({
        access_token: credential.access_token,
        refresh_token: credential.refresh_token,
      });

      const { credentials } = await this.client.refreshAccessToken();

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

      return this.projectId || initialProjectId;
    } catch (error) {
      console.error("Failed to discover project ID:", error);
      throw error;
    }
  }

  private async loadCodeAssist(projectId: string, metadata: Record<string, unknown>) {
    const response = await this.client.request<{ cloudaicompanionProject?: string; allowedTiers?: { id: string; isDefault: boolean }[] }>({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:loadCodeAssist`,
      method: "POST",
      body: JSON.stringify({
        cloudaicompanionProject: projectId,
        metadata,
      }),
    });
    return response.data;
  }

  private async onboardUser(tierId: string, projectId: string, metadata: Record<string, unknown>) {
    const response = await this.client.request<{ done?: boolean; response?: { cloudaicompanionProject?: { id: string } } }>({
      url: `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:onboardUser`,
      method: "POST",
      body: JSON.stringify({
        tierId,
        cloudaicompanionProject: projectId,
        metadata,
      }),
    });
    return response.data;
  }


}
