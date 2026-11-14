import { PortError } from "../errors";
import type { EmailMessage, EmailSender } from "../ports";
import { renderMime, toGmailRaw } from "./email-mime";
import { renderEmail } from "./email-render";

export interface GmailEmailOptions {
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  readonly refreshToken: string | undefined;
  readonly senderEmail: string | undefined;
  readonly senderName?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

interface GmailConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly senderEmail: string;
}

interface TokenCache {
  readonly token: string;
  readonly expiresAt: number;
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_ORIGIN = "https://gmail.googleapis.com";
const TOKEN_SKEW_MS = 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

class GmailUnauthorizedError extends Error {}

/** Gmail API adapter using the OAuth2 refresh-token grant; no SDK. */
export class GmailEmailAdapter implements EmailSender {
  private cachedToken: TokenCache | null = null;

  constructor(private readonly options: GmailEmailOptions) {}

  private config(): GmailConfig {
    const { clientId, clientSecret, refreshToken, senderEmail } = this.options;
    if (
      clientId === undefined ||
      clientId.length === 0 ||
      clientSecret === undefined ||
      clientSecret.length === 0 ||
      refreshToken === undefined ||
      refreshToken.length === 0 ||
      senderEmail === undefined ||
      senderEmail.length === 0
    ) {
      throw new PortError(
        "email",
        "Gmail OAuth is not configured (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL)",
        false
      );
    }
    return { clientId, clientSecret, refreshToken, senderEmail };
  }

  private async accessToken(config: GmailConfig): Promise<string> {
    const now = Date.now();
    if (this.cachedToken !== null && this.cachedToken.expiresAt > now + TOKEN_SKEW_MS) {
      return this.cachedToken.token;
    }

    const fetchImpl = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: config.refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret
        }).toString()
      });
    } catch (error) {
      throw new PortError("email", "Gmail OAuth refresh request failed", true, { cause: error });
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const errorCode = isRecord(payload) ? payload["error"] : null;
      const detail = typeof errorCode === "string" ? errorCode : `status ${response.status}`;
      throw new PortError(
        "email",
        `Gmail OAuth refresh failed: ${detail}`,
        detail !== "invalid_grant"
      );
    }
    if (
      !isRecord(payload) ||
      typeof payload["access_token"] !== "string" ||
      typeof payload["expires_in"] !== "number" ||
      !Number.isFinite(payload["expires_in"]) ||
      payload["expires_in"] <= 0
    ) {
      throw new PortError("email", "Gmail OAuth refresh response is malformed", true);
    }

    const token = payload["access_token"];
    const expiresIn = payload["expires_in"];
    this.cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
    return token;
  }

  private async sendRaw(
    config: GmailConfig,
    accessToken: string,
    raw: string
  ): Promise<{ readonly messageId: string }> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const url = `${GMAIL_ORIGIN}/gmail/v1/users/${encodeURIComponent(config.senderEmail)}/messages/send`;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ raw })
      });
    } catch (error) {
      throw new PortError("email", "Gmail send request failed", true, { cause: error });
    }

    if (response.status === 401) {
      throw new GmailUnauthorizedError();
    }
    if (!response.ok) {
      throw new PortError(
        "email",
        `Gmail send failed with status ${response.status}`,
        response.status === 429 || response.status >= 500
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!isRecord(payload) || typeof payload["id"] !== "string" || payload["id"].length === 0) {
      throw new PortError("email", "Gmail send response is malformed", true);
    }
    return { messageId: payload["id"] };
  }

  async send(message: EmailMessage): Promise<{ readonly messageId: string }> {
    const config = this.config();
    const rendered = renderEmail(message);
    const raw = toGmailRaw(
      renderMime({
        from: config.senderEmail,
        to: message.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        displayName: this.options.senderName
      })
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const token = await this.accessToken(config);
      try {
        return await this.sendRaw(config, token, raw);
      } catch (error) {
        if (error instanceof GmailUnauthorizedError && attempt === 0) {
          this.cachedToken = null;
          continue;
        }
        if (error instanceof GmailUnauthorizedError) {
          throw new PortError("email", "Gmail rejected the refreshed access token", false);
        }
        throw error;
      }
    }
    throw new PortError("email", "Gmail send failed after token refresh", true);
  }
}
