const toBytes = (input: ArrayBuffer | Uint8Array | string): Uint8Array => {
  if (typeof input === "string") return new TextEncoder().encode(input);
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(input: ArrayBuffer | Uint8Array | string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toBytes(input));
  return toHex(new Uint8Array(digest));
}

/** High-entropy opaque token; the hash, never the token, is persisted. */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** Length-independent comparison for hex digests. */
export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
