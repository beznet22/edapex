/**
 * Device identity.
 *
 * The local store seals every record with a key derived from a master key that
 * never leaves this device, so that key has to persist across reloads.
 *
 * **One storage mechanism, not two.** This used IndexedDB, which meant the app had
 * two persistence APIs, two failure modes and two versioned schemas for what is a
 * single job. The key is now a file in the origin private file system — the same
 * OPFS the SQLite database lives in. One availability check covers both: if OPFS is
 * unavailable, neither the key nor the database persists, and the workspace is
 * offline-only rather than half-persistent.
 *
 * **The key is a separate file, not a row.** Putting it inside the encrypted
 * database would make the encryption pointless against anyone who copies that one
 * file out. A sibling file is still the same storage layer, but it is not the same
 * artifact.
 *
 * Worth being precise about what this does *not* do: an attacker with script
 * execution in this origin can read both the database and this file. This protects
 * against a partial copy — a backup tool that grabs the OPFS directory — not
 * against XSS. Wrapping the key with credential-derived material is the real fix,
 * and it belongs with the cross-device recovery design in spec 41.
 */

const IDENTITY_FILE = "edapex-identity.json";

interface StoredIdentity {
  readonly deviceId: string;
  /** Base64 of the 32-byte master key. */
  readonly masterKey: string;
}

export interface DeviceIdentity {
  readonly deviceId: string;
  readonly masterKey: Uint8Array;
}

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function randomKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function identityDirectory(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator === "undefined" || navigator.storage === undefined) {
    throw new Error("OPFS is not available");
  }
  return navigator.storage.getDirectory();
}

async function readStored(): Promise<StoredIdentity | null> {
  try {
    const directory = await identityDirectory();
    const handle = await directory.getFileHandle(IDENTITY_FILE, { create: false });
    const text = await (await handle.getFile()).text();
    const parsed = JSON.parse(text) as Partial<StoredIdentity>;
    if (typeof parsed.deviceId !== "string" || typeof parsed.masterKey !== "string") {
      return null;
    }
    return { deviceId: parsed.deviceId, masterKey: parsed.masterKey };
  } catch {
    // Absent file, unreadable store, or malformed content all mean "generate a
    // fresh identity" rather than a hard failure.
    return null;
  }
}

async function writeStored(identity: StoredIdentity): Promise<void> {
  const directory = await identityDirectory();
  const handle = await directory.getFileHandle(IDENTITY_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(identity));
  await writable.close();
}

let cached: DeviceIdentity | null = null;

/**
 * Reads or creates this device's identity.
 *
 * Generated once and then only read, so the same records stay readable across
 * reloads. Two tabs share the same origin storage, so they also share the
 * identity — which is what makes "one brief per day across tabs" meaningful.
 */
export async function deviceIdentity(): Promise<DeviceIdentity> {
  if (cached !== null) return cached;

  const stored = await readStored();
  if (stored !== null) {
    cached = { deviceId: stored.deviceId, masterKey: decode(stored.masterKey) };
    return cached;
  }

  const created: StoredIdentity = {
    deviceId: `device-${crypto.randomUUID()}`,
    masterKey: encode(randomKey())
  };
  await writeStored(created);

  cached = { deviceId: created.deviceId, masterKey: decode(created.masterKey) };
  return cached;
}

/** Test seam: forget the cached identity so a fresh read hits storage again. */
export function resetDeviceIdentity(): void {
  cached = null;
}
