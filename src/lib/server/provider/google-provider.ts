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
import { cookies } from "$lib/server/helpers";
import type { Provider } from "ai";
import type { Cookies } from "@sveltejs/kit";
import { getRequestEvent } from "$app/server";

const COOKIE_GRACE_SEC = 60; // 1 minute buffer: Grace period

export class GoogleProvider implements OAuth2Client {
  readonly type = CredentialType.GOOGLE_OAUTH;
  readonly config: ProviderConfig;
  readonly credentials: Credential | null;
  private client: Client | null = null;

  constructor() {
    this.config = googleConfig;

    const { cookies } = getRequestEvent();
    const cred = cookies.get(this.type);
    this.credentials = cred ? (JSON.parse(cred) as Credential) : null;

    this.client = new Client({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri: "https://codeassist.google.com/authcode",
    });
  }

  async getAccessToken(): Promise<{ accessToken: string; endpoint: string } | null> {
    if (!this.client) return null;
    const { token } = await this.client.getAccessToken();
    if (!token) return null;
    const endpoint = this.getCurrentEndpoint();

    return { accessToken: token, endpoint };
  }

  async getToken(
    code: string,
    codeVerifier: string
  ): Promise<Credential | { status: string; slowDown?: boolean }> {
    if (!this.client) return { status: "error" };
    try {
      // Exchange code for Credentials using google-auth-library
      const redirectUri = "https://codeassist.google.com/authcode";
      const { tokens } = await this.client.getToken({
        code,
        codeVerifier,
        redirect_uri: redirectUri,
      });

      this.client.setCredentials(tokens);
      const credential = {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token || "",
        expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
        token_type: "Bearer",
        obtained_at: Date.now(),
      };
      this.setCredentials(credential);
      return credential;
    } catch (error) {
      console.error("Failed to authenticate with authorization code:", error);
      return { status: "error" };
    }
  }

  setCredentials(credential: Credential): void {
    const expiresMs = (credential.expires_in + COOKIE_GRACE_SEC) * 1000;
    const { cookies } = getRequestEvent();
    cookies.set(this.type, JSON.stringify(credential), {
      expires: new Date(expiresMs),
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
    try {
      const redirectUri = "https://codeassist.google.com/authcode";
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

      cookies.set(this.type, JSON.stringify({ codeVerifier, state }), 3600);
      return { authUrl, device_code: "", interval: 0, expires_in: 0 };
    } catch (error) {
      console.error("QwenCode user code authentication failed:", error);
      return null;
    }
  }

  async geModelProvider(): Promise<Provider | null> {
    throw new Error("Not implemented");
  }

  getCurrentEndpoint(): string {
    return "https://codeassist.google.com/authcode";
  }

  async fetchUserInfo(client: Client): Promise<{ email: string; [key: string]: any } | null> {
    try {
      // Get access token from client
      const { token } = await client.getAccessToken();
      if (!token) {
        return null;
      }

      const response = await fetch(this.config.userInfoUrl!, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.log("Failed to fetch user info:", response.status, response.statusText);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.log("Error retrieving user info:", error);
      return null;
    }
  }

  async refreshToken(refreshCredential: string): Promise<Credential> {
    const client = new Client({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    });

    try {
      // Set refresh Credential and get new Credential
      client.setCredentials({ refresh_token: refreshCredential });
      const { credentials } = await client.refreshAccessToken();

      return {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || refreshCredential,
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
}
