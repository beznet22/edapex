import { toAuditArguments } from "./audit";

/**
 * Secret box.
 *
 * Connector credentials live here and are **write-only from the API's point of
 * view**: there is no method that returns a stored secret to a caller. The only
 * way out is `withSecret`, which hands the plaintext to a callback inside the
 * Worker and never to a response body.
 *
 * That shape is the guarantee. A `getSecret` returning a string would be safe
 * only as long as every caller remembered not to serialise it; not exposing one
 * makes the mistake unavailable.
 */

/** 12-byte AES-GCM nonce plus tag; the ciphertext is stored base64. */
const NONCE_BYTES = 12;
const SECRET_CONTEXT = "edapex-cowork secret box v1";

export interface SealedSecret {
  /** Base64 of `iv || ciphertext || tag`. */
  readonly ciphertext: string;
  /** Identifier of the key that sealed it, for rotation. */
  readonly keyId: string;
}

/**
 * Derives a per-workspace key.
 *
 * Per-workspace rather than global so one leaked derived key exposes one tenant's
 * connector tokens rather than every tenant's.
 */
async function deriveKey(masterKey: ArrayBuffer, workspaceId: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", masterKey, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(workspaceId),
      info: new TextEncoder().encode(SECRET_CONTEXT)
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function keyIdFor(masterKey: ArrayBuffer, workspaceId: string): Promise<string> {
  return crypto.subtle
    .digest("SHA-256", masterKey)
    .then((digest) =>
      Array.from(new Uint8Array(digest).slice(0, 8))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
    )
    .then((hash) => `${workspaceId}:${hash}`);
}

export async function seal(
  masterKey: ArrayBuffer,
  workspaceId: string,
  plaintext: string
): Promise<SealedSecret> {
  const key = await deriveKey(masterKey, workspaceId);
  const iv = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  const combined = new Uint8Array(iv.length + sealed.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(sealed), iv.length);

  return {
    ciphertext: btoa(String.fromCharCode(...combined)),
    keyId: await keyIdFor(masterKey, workspaceId)
  };
}

async function open(
  masterKey: ArrayBuffer,
  workspaceId: string,
  sealed: SealedSecret
): Promise<string> {
  if (sealed.keyId !== (await keyIdFor(masterKey, workspaceId))) {
    throw new Error("This secret was sealed with a different key.");
  }
  const bytes = Uint8Array.from(atob(sealed.ciphertext), (character) => character.charCodeAt(0));
  const key = await deriveKey(masterKey, workspaceId);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, NONCE_BYTES) },
    key,
    bytes.slice(NONCE_BYTES)
  );
  return new TextDecoder().decode(plaintext);
}

export interface SecretRow {
  readonly workspace_id: string;
  readonly name: string;
  readonly ciphertext: string;
  readonly key_id: string;
  readonly updated_at: number;
}

/**
 * Read-write store of sealed secrets.
 *
 * `list` returns names only — never a ciphertext — so the UI can show which
 * connectors are configured without carrying anything secret toward a client.
 */
export class SecretBox {
  constructor(
    private readonly db: D1Database,
    private readonly masterKey: ArrayBuffer
  ) {}

  /** Write-only: nothing here returns the value that was stored. */
  async put(workspaceId: string, name: string, value: string): Promise<void> {
    const sealed = await seal(this.masterKey, workspaceId, value);
    await this.db
      .prepare(
        "INSERT INTO agent_secrets (workspace_id, name, ciphertext, key_id, updated_at) \
         VALUES (?, ?, ?, ?, ?) \
         ON CONFLICT (workspace_id, name) DO UPDATE SET \
           ciphertext = excluded.ciphertext, key_id = excluded.key_id, updated_at = excluded.updated_at"
      )
      .bind(workspaceId, name, sealed.ciphertext, sealed.keyId, Date.now())
      .run();
  }

  async delete(workspaceId: string, name: string): Promise<boolean> {
    const result = await this.db
      .prepare("DELETE FROM agent_secrets WHERE workspace_id = ? AND name = ?")
      .bind(workspaceId, name)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }

  /** Names and timestamps only. No ciphertext leaves this method. */
  async list(workspaceId: string): Promise<{ name: string; updatedAt: number }[]> {
    const { results } = await this.db
      .prepare("SELECT name, updated_at FROM agent_secrets WHERE workspace_id = ? ORDER BY name")
      .bind(workspaceId)
      .all<{ name: string; updated_at: number }>();
    return results.map((row) => ({ name: row.name, updatedAt: row.updated_at }));
  }

  /**
   * The only way to use a secret.
   *
   * The plaintext exists as a local variable inside the Worker for the duration
   * of the callback. It is never returned, never logged, and never placed on the
   * request context.
   */
  async withSecret<T>(
    workspaceId: string,
    name: string,
    use: (value: string) => Promise<T>
  ): Promise<T> {
    const row = await this.db
      .prepare("SELECT * FROM agent_secrets WHERE workspace_id = ? AND name = ?")
      .bind(workspaceId, name)
      .first<SecretRow>();

    if (row === null) throw new Error(`No secret named ${name}.`);

    const plaintext = await open(this.masterKey, workspaceId, {
      ciphertext: row.ciphertext,
      keyId: row.key_id
    });

    try {
      return await use(plaintext);
    } finally {
      // Best effort: a JS string cannot be zeroed, but discarding the reference
      // promptly is still better than holding it for the life of the request.
      void plaintext;
    }
  }
}

/**
 * Redacts a connector's error before it reaches an audit event or a response.
 *
 * Provider errors routinely echo the token they rejected, so this runs on the way
 * out rather than trusting the message to be clean.
 */
export function redactSecret(message: string): string {
  return message
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/(access_token|refresh_token|client_secret|api[_-]?key)"?\s*[:=]\s*"?[A-Za-z0-9._~+/-]+=*/gi, "$1=[redacted]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted]");
}

export { toAuditArguments };
