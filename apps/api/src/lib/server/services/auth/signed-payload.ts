import { base64UrlEncode } from "../crypto/digest";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64Url = base64UrlEncode;

const fromBase64Url = (value: string): Uint8Array | null => {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
};

const importKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export type PayloadGuard<T> = (value: unknown) => value is T;

/** Signed, expiring payloads for the claim ticket and the OAuth state cookie. */
export async function signPayload(
  secret: string,
  payload: Readonly<Record<string, unknown>>,
  expiresAt: number
): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify({ ...payload, exp: expiresAt })));
  const signature = await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyPayload<T>(
  secret: string,
  token: string,
  guard: PayloadGuard<T>,
  now: number
): Promise<T | null> {
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;
  const body = token.slice(0, separator);
  const signature = fromBase64Url(token.slice(separator + 1));
  if (signature === null) return null;

  const valid = await crypto.subtle.verify(
    "HMAC",
    await importKey(secret),
    signature,
    encoder.encode(body)
  );
  if (!valid) return null;

  const bytes = fromBase64Url(body);
  if (bytes === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const expiry = parsed["exp"];
  if (typeof expiry !== "number" || expiry <= now) return null;
  return guard(parsed) ? parsed : null;
}
