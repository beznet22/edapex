/**
 * FCM HTTP v1, with nothing but WebCrypto.
 *
 * A service account signs a short-lived JWT, that JWT becomes an OAuth token,
 * and the token is cached until it is nearly expired. The alternative — a
 * long-lived server key — is retired by Google and cannot be scoped.
 */

export interface PushMessage {
  readonly token: string;
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string>>;
}

export type SendOutcome =
  | { readonly ok: true }
  /** The token is dead: the install is gone, so the row should be retired. */
  | { readonly ok: false; readonly reason: "unregistered" }
  | { readonly ok: false; readonly reason: "failed"; readonly message: string };

export interface PushSender {
  send(message: PushMessage): Promise<SendOutcome>;
}

interface ServiceAccount {
  readonly client_email: string;
  readonly private_key: string;
  readonly project_id: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export class FcmSender implements PushSender {
  private cached: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly account: ServiceAccount,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = () => Date.now()
  ) {}

  async send(message: PushMessage): Promise<SendOutcome> {
    const accessToken = await this.accessToken();
    const response = await this.fetcher(
      `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          message: {
            token: message.token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: { priority: "high" }
          }
        })
      }
    );
    if (response.ok) return { ok: true };

    const text = await response.text().catch(() => "");
    // Google answers 404 for a token whose app install is gone, and 400 with
    // UNREGISTERED for a stale one; both mean "stop using this address".
    if (response.status === 404 || text.includes("UNREGISTERED")) {
      return { ok: false, reason: "unregistered" };
    }
    return { ok: false, reason: "failed", message: `${response.status} ${text.slice(0, 200)}` };
  }

  private async accessToken(): Promise<string> {
    const now = this.now();
    if (this.cached !== null && this.cached.expiresAt > now) return this.cached.value;

    const issuedAt = Math.floor(now / 1000);
    const claims = {
      iss: this.account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600
    };
    const assertion = await signJwt(claims, this.account.private_key);

    const response = await this.fetcher(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    });
    if (!response.ok) {
      throw new Error(`FCM token exchange failed: ${response.status}`);
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (typeof body.access_token !== "string") {
      throw new Error("FCM token exchange returned no access_token");
    }
    this.cached = {
      value: body.access_token,
      // Renew a minute early: a token that expires mid-flight is a failed push.
      expiresAt: now + ((body.expires_in ?? 3600) - 60) * 1000
    };
    return this.cached.value;
  }
}

async function signJwt(claims: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

function pemToBytes(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Null when the deployment has no Firebase credentials: push is then simply off. */
export function createSender(env: {
  readonly FCM_SERVICE_ACCOUNT?: string;
}): PushSender | null {
  if (env.FCM_SERVICE_ACCOUNT === undefined || env.FCM_SERVICE_ACCOUNT.length === 0) return null;
  try {
    const account = JSON.parse(env.FCM_SERVICE_ACCOUNT) as Partial<ServiceAccount>;
    if (
      typeof account.client_email !== "string" ||
      typeof account.private_key !== "string" ||
      typeof account.project_id !== "string"
    ) {
      return null;
    }
    return new FcmSender({
      client_email: account.client_email,
      private_key: account.private_key,
      project_id: account.project_id
    });
  } catch {
    return null;
  }
}
