import { and, eq, isNull } from "drizzle-orm";

import { pushDevices } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface DeviceRegistration {
  readonly platform: "android" | "web" | "ios";
  readonly token: string;
  readonly installId: string;
  readonly keysJson: string | null;
}

export interface ActiveDevice {
  readonly id: number;
  readonly platform: "android" | "web" | "ios";
  readonly token: string;
  readonly keysJson: string | null;
  readonly prefsJson: string | null;
  readonly failureCount: number;
}

/**
 * Register or refresh an install.
 *
 * The conflict target is `(user_id, install_id)`, not the token: a device that
 * re-registers after an FCM token rotation must update its row, and a token that
 * moved to another person must not steal the row's preferences.
 */
export async function registerDevice(
  ctx: ScopedRepositoryContext,
  userId: number,
  device: DeviceRegistration,
  now: number
): Promise<number> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .insert(pushDevices)
      .values({
        schoolId: ctx.tenant.schoolId,
        userId,
        platform: device.platform,
        token: device.token,
        installId: device.installId,
        keysJson: device.keysJson,
        createdAt: now,
        lastSeenAt: now
      })
      .onConflictDoUpdate({
        target: [pushDevices.userId, pushDevices.installId],
        set: {
          token: device.token,
          keysJson: device.keysJson,
          lastSeenAt: now,
          revokedAt: null
        }
      })
      .returning({ id: pushDevices.id });
    const row = rows[0];
    if (row === undefined) throw new Error("registerDevice returned no row");
    return row.id;
  }, "registerDevice");
}

/** Revocation is a timestamp, so a failed delivery can tell "gone" from "broken". */
export async function revokeDevice(
  ctx: ScopedRepositoryContext,
  userId: number,
  deviceId: number,
  now: number
): Promise<boolean> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .update(pushDevices)
      .set({ revokedAt: now })
      .where(
        and(
          eq(pushDevices.id, deviceId),
          eq(pushDevices.userId, userId),
          eq(pushDevices.schoolId, ctx.tenant.schoolId)
        )
      )
      .returning({ id: pushDevices.id });
    return rows.length > 0;
  }, "revokeDevice");
}

/** Preferences are per person, so every live install of theirs is updated at once. */
export async function updatePreferences(
  ctx: ScopedRepositoryContext,
  userId: number,
  prefsJson: string,
  now: number
): Promise<number> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .update(pushDevices)
      .set({ prefsJson, lastSeenAt: now })
      .where(
        and(
          eq(pushDevices.userId, userId),
          eq(pushDevices.schoolId, ctx.tenant.schoolId),
          isNull(pushDevices.revokedAt)
        )
      )
      .returning({ id: pushDevices.id });
    return rows.length;
  }, "updatePreferences");
}

export async function listActiveDevices(
  ctx: ScopedRepositoryContext,
  userId: number
): Promise<readonly ActiveDevice[]> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({
        id: pushDevices.id,
        platform: pushDevices.platform,
        token: pushDevices.token,
        keysJson: pushDevices.keysJson,
        prefsJson: pushDevices.prefsJson,
        failureCount: pushDevices.failureCount
      })
      .from(pushDevices)
      .where(
        and(
          eq(pushDevices.userId, userId),
          eq(pushDevices.schoolId, ctx.tenant.schoolId),
          isNull(pushDevices.revokedAt)
        )
      );
    return rows;
  }, "listActiveDevices");
}

/**
 * A token that keeps failing is retired rather than retried forever.
 *
 * FCM answers `UNREGISTERED` for a dead token; counting to three keeps a
 * transient outage from revoking a device that is merely offline.
 */
export async function recordDeliveryFailure(
  ctx: ScopedRepositoryContext,
  deviceId: number,
  revoke: boolean,
  now: number
): Promise<void> {
  return withErrorHandling(async () => {
    await ctx.db
      .update(pushDevices)
      .set({
        failureCount: (await currentFailures(ctx, deviceId)) + 1,
        ...(revoke ? { revokedAt: now } : {})
      })
      .where(eq(pushDevices.id, deviceId));
  }, "recordDeliveryFailure");
}

export async function recordDeliverySuccess(
  ctx: ScopedRepositoryContext,
  deviceId: number
): Promise<void> {
  return withErrorHandling(async () => {
    await ctx.db
      .update(pushDevices)
      .set({ failureCount: 0 })
      .where(eq(pushDevices.id, deviceId));
  }, "recordDeliverySuccess");
}

async function currentFailures(
  ctx: ScopedRepositoryContext,
  deviceId: number
): Promise<number> {
  const rows = await ctx.db
    .select({ failureCount: pushDevices.failureCount })
    .from(pushDevices)
    .where(eq(pushDevices.id, deviceId));
  return rows[0]?.failureCount ?? 0;
}
