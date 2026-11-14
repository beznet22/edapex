/**
 * Device identity.
 *
 * The local store seals every record with a key derived from a master key that
 * never leaves this device. That key has to persist across reloads, and it must
 * not be `localStorage`: spec 41 forbids that for anything beyond cosmetic state,
 * and a key is the one thing where a synchronous, script-readable store is the
 * worst possible home.
 *
 * IndexedDB is used for the key and for the device id. Both are generated once and
 * then only read.
 *
 * **Honest limitation:** the key is stored unwrapped. A production implementation
 * wraps it with credentials-derived material so that clearing site data does not
 * strand synced ciphertext; that belongs with the cross-device recovery design in
 * `41`, not with this chunk. What is true today is that losing this browser's
 * storage loses the ability to read that browser's local rows.
 */

const DB_NAME = "edapex-identity";
const STORE = "keys";
const VERSION = 1;

const MASTER_KEY = "master";
const DEVICE_ID = "device";

interface IdentityRecord {
  readonly id: string;
  readonly value: Uint8Array | string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function read<T extends IdentityRecord>(id: string): Promise<T | null> {
  const db = await openDatabase();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
  } finally {
    db.close();
  }
}

async function write(record: IdentityRecord): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("IndexedDB write failed"));
    });
  } finally {
    db.close();
  }
}

/** 32 bytes from the platform CSPRNG. */
function randomKey(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

export interface DeviceIdentity {
  readonly deviceId: string;
  readonly masterKey: Uint8Array;
}

let cached: DeviceIdentity | null = null;

/**
 * Reads or creates this device's identity.
 *
 * Generated once and then only read, so the same records stay readable across
 * reloads. Two tabs share the same database, so they also share the identity —
 * which is what makes "one brief per day across tabs" meaningful.
 */
export async function deviceIdentity(): Promise<DeviceIdentity> {
  if (cached !== null) return cached;

  const [keyRecord, idRecord] = await Promise.all([
    read<IdentityRecord>(MASTER_KEY),
    read<IdentityRecord>(DEVICE_ID)
  ]);

  const masterKey =
    keyRecord !== null && keyRecord.value instanceof Uint8Array
      ? keyRecord.value
      : randomKey();

  if (keyRecord === null) await write({ id: MASTER_KEY, value: masterKey });

  const deviceId =
    idRecord !== null && typeof idRecord.value === "string"
      ? idRecord.value
      : `device-${crypto.randomUUID()}`;

  if (idRecord === null) await write({ id: DEVICE_ID, value: deviceId });

  cached = { deviceId, masterKey };
  return cached;
}

/** Test seam: forget the cached identity so a fresh read hits storage again. */
export function resetDeviceIdentity(): void {
  cached = null;
}
