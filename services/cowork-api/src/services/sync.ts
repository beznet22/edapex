import {
  apiError,
  type PullQuery,
  type PushInput,
  type RegisterDeviceInput
} from "../schema";

/**
 * Cloud side of the sync channel.
 *
 * The server is deliberately dumb about content: it stores ciphertext, enforces
 * that devices are active, and keeps the append-only ordering. It never decrypts,
 * which is why it needs no key material and why a compromised Worker cannot read
 * a transcript.
 */

export interface DeviceRecord {
  readonly id: string;
  readonly userId: string;
  readonly publicKey: string;
  readonly name: string | null;
  readonly createdAt: number;
  readonly lastSeenAt: number | null;
  readonly revokedAt: number | null;
}

export type PushResult =
  | { readonly ok: true; readonly accepted: number; readonly cursor: number }
  | { readonly ok: false; readonly error: ReturnType<typeof apiError>; readonly status: 400 | 403 };

export type PullResult =
  | {
      readonly ok: true;
      readonly events: readonly {
        readonly id: string;
        readonly entityType: string;
        readonly entityId: string;
        readonly operation: string;
        readonly ciphertext: string;
        readonly checksum: string;
        readonly deviceId: string;
        readonly deviceSeq: number;
        readonly createdAt: number;
        readonly receivedAt: number;
      }[];
      readonly nextCursor: string;
    }
  | { readonly ok: false; readonly error: ReturnType<typeof apiError>; readonly status: 400 | 403 };

interface DeviceRow {
  id: string;
  user_id: string;
  public_key: string;
  name: string | null;
  created_at: number;
  last_seen_at: number | null;
  revoked_at: number | null;
}

function toDevice(row: DeviceRow): DeviceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    publicKey: row.public_key,
    name: row.name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at
  };
}

/** SHA-256 over the raw ciphertext bytes, lowercase hex. */
export async function checksumOf(ciphertext: string): Promise<string> {
  const bytes = Uint8Array.from(atob(ciphertext), (character) => character.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function registerDevice(
  db: D1Database,
  userId: string,
  input: RegisterDeviceInput
): Promise<DeviceRecord> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO sync_devices (id, user_id, public_key, name, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, userId, input.publicKey, input.name ?? null, now)
    .run();

  return {
    id,
    userId,
    publicKey: input.publicKey,
    name: input.name ?? null,
    createdAt: now,
    lastSeenAt: null,
    revokedAt: null
  };
}

/** Revoking is a tombstone, not a delete: the device row is the audit trail. */
export async function revokeDevice(
  db: D1Database,
  userId: string,
  deviceId: string
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE sync_devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL")
    .bind(Date.now(), deviceId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listDevices(db: D1Database, userId: string): Promise<DeviceRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM sync_devices WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId)
    .all<DeviceRow>();
  return results.map(toDevice);
}

/**
 * Resolves a device, distinguishing "unknown" from "revoked" so the client can
 * tell the user to re-pair rather than silently retrying forever.
 */
async function activeDevice(
  db: D1Database,
  userId: string,
  deviceId: string
): Promise<{ ok: true; device: DeviceRecord } | { ok: false; result: { ok: false; error: ReturnType<typeof apiError>; status: 403 } }> {
  const row = await db
    .prepare("SELECT * FROM sync_devices WHERE id = ? AND user_id = ?")
    .bind(deviceId, userId)
    .first<DeviceRow>();

  if (row === null) {
    return {
      ok: false,
      result: { ok: false, error: apiError("Unknown device.", "device_unknown"), status: 403 }
    };
  }
  if (row.revoked_at !== null) {
    return {
      ok: false,
      result: { ok: false, error: apiError("This device has been revoked.", "device_revoked"), status: 403 }
    };
  }
  return { ok: true, device: toDevice(row) };
}

export async function push(db: D1Database, userId: string, input: PushInput): Promise<PushResult> {
  const device = await activeDevice(db, userId, input.deviceId);
  if (!device.ok) return device.result;

  // Verify each checksum before writing. This catches corruption in transit and
  // a truncated base64 body, neither of which would surface until a client tried
  // to decrypt a record that never arrived intact.
  for (const event of input.events) {
    const expected = await checksumOf(event.ciphertext);
    if (expected !== event.checksum) {
      return {
        ok: false,
        error: apiError(`Checksum mismatch for event ${event.id}.`, "invalid_request"),
        status: 400
      };
    }
  }

  const maxSeq = Math.max(...input.events.map((event) => event.deviceSeq));
  const now = Date.now();
  // One timestamp for the whole batch: within a batch the id is the tie-breaker,
  // which keeps the order total without inventing a sequence column.
  const receivedAt = now;

  // One batch: the events, the device heartbeat and the cursor commit together.
  // A cursor that advanced without its events would make the client drop them.
  const statements: D1PreparedStatement[] = input.events.map((event) =>
    db
      .prepare(
        "INSERT OR IGNORE INTO sync_events \
         (id, workspace_id, entity_type, entity_id, operation, payload_json, ciphertext, device_id, device_seq, checksum, created_at, received_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        event.id,
        input.workspaceId,
        event.entityType,
        event.entityId,
        event.operation,
        JSON.stringify({
          entityType: event.entityType,
          entityId: event.entityId,
          operation: event.operation
        }),
        event.ciphertext,
        input.deviceId,
        event.deviceSeq,
        event.checksum,
        event.createdAt,
        receivedAt
      )
  );

  statements.push(
    db
      .prepare("UPDATE sync_devices SET last_seen_at = ? WHERE id = ?")
      .bind(now, input.deviceId),
    db
      .prepare(
        "INSERT INTO sync_cursors (device_id, workspace_id, scope, last_seq, updated_at) \
         VALUES (?, ?, 'default', ?, ?) \
         ON CONFLICT (device_id, workspace_id, scope) \
         DO UPDATE SET last_seq = MAX(sync_cursors.last_seq, excluded.last_seq), updated_at = excluded.updated_at"
      )
      .bind(input.deviceId, input.workspaceId, maxSeq, now)
  );

  const results = await db.batch(statements);
  const accepted = results
    .slice(0, input.events.length)
    .reduce((total, result) => total + (result.meta.changes ?? 0), 0);

  return { ok: true, accepted, cursor: maxSeq };
}

/** Encodes the pull position. Opaque to clients; they only echo it back. */
export function encodeCursor(receivedAt: number, id: string): string {
  return `${receivedAt}:${id}`;
}

export function decodeCursor(cursor: string): { receivedAt: number; id: string } {
  if (cursor === "") return { receivedAt: 0, id: "" };
  const separator = cursor.indexOf(":");
  const receivedAt = Number.parseInt(cursor.slice(0, separator), 10);
  return {
    receivedAt: Number.isFinite(receivedAt) ? receivedAt : 0,
    id: cursor.slice(separator + 1)
  };
}

export async function pull(db: D1Database, userId: string, query: PullQuery): Promise<PullResult> {
  const device = await activeDevice(db, userId, query.deviceId);
  if (!device.ok) return device.result;

  const after = decodeCursor(query.cursor);

  // Row-value comparison, ordered by the server's receive time. Ordering by the
  // client's `created_at` would let a device with a wrong clock write events that
  // sort behind another device's cursor and are therefore never pulled.
  const { results } = await db
    .prepare(
      "SELECT id, entity_type, entity_id, operation, ciphertext, checksum, device_id, device_seq, created_at, received_at \n       FROM sync_events \n       WHERE workspace_id = ? AND device_id != ? AND (received_at, id) > (?, ?) \n       ORDER BY received_at ASC, id ASC LIMIT ?"
    )
    .bind(query.workspaceId, query.deviceId, after.receivedAt, after.id, query.limit)
    .all<{
      id: string;
      entity_type: string;
      entity_id: string;
      operation: string;
      ciphertext: string;
      checksum: string;
      device_id: string;
      device_seq: number;
      created_at: number;
      received_at: number;
    }>();

  const events = results.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    ciphertext: row.ciphertext,
    checksum: row.checksum,
    deviceId: row.device_id,
    deviceSeq: row.device_seq,
    createdAt: row.created_at,
    receivedAt: row.received_at
  }));

  // Never move the cursor past what was actually returned: a short page must
  // leave the client asking for the rest, not skip it.
  const last = events.at(-1);
  const nextCursor = last === undefined ? query.cursor : encodeCursor(last.receivedAt, last.id);
  return { ok: true, events, nextCursor };
}
