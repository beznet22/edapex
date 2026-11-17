import type { PushEvent, PushKind } from "@edapex/contracts/push";
import { DEFAULT_NOTIFICATION_PREFS, notificationPrefsSchema } from "@edapex/contracts/push";

import { createService, type ServiceContext } from "../context";
import { requireScopedContext } from "../context/service-context";
import { NotFoundError } from "../errors";
import type { DeviceRegistration } from "../../repository/push";

/**
 * Devices, preferences and the fan-out decision.
 *
 * The transport is a port: a test asserts who a push is for, and a fake sender
 * asserts what was delivered without reaching Google.
 */
export class PushService {
  constructor(private readonly ctx: ServiceContext) {}

  async register(userId: number, device: DeviceRegistration): Promise<{ id: number }> {
    const id = await this.ctx.repos.push.registerDevice(
      requireScopedContext(this.ctx.repos.ctx),
      userId,
      device,
      this.now()
    );
    return { id };
  }

  async revoke(userId: number, deviceId: number): Promise<void> {
    const revoked = await this.ctx.repos.push.revokeDevice(
      requireScopedContext(this.ctx.repos.ctx),
      userId,
      deviceId,
      this.now()
    );
    if (!revoked) throw new NotFoundError("Device", deviceId);
  }

  async setPreferences(userId: number, prefsJson: string): Promise<{ devices: number }> {
    const parsed = notificationPrefsSchema.parse(JSON.parse(prefsJson));
    const devices = await this.ctx.repos.push.updatePreferences(
      requireScopedContext(this.ctx.repos.ctx),
      userId,
      JSON.stringify(parsed),
      this.now()
    );
    return { devices };
  }

  /** Preferences are opt-outs, so a row that predates this feature still delivers. */
  preferencesOf(prefsJson: string | null): typeof DEFAULT_NOTIFICATION_PREFS {
    if (prefsJson === null) return DEFAULT_NOTIFICATION_PREFS;
    try {
      return notificationPrefsSchema.parse(JSON.parse(prefsJson));
    } catch {
      return DEFAULT_NOTIFICATION_PREFS;
    }
  }

  async audience(event: PushEvent): Promise<readonly number[]> {
    return this.ctx.repos.push.resolveAudience(
      requireScopedContext(this.ctx.repos.ctx),
      event.audience
    );
  }

  async devicesOf(userId: number) {
    return this.ctx.repos.push.listActiveDevices(
      requireScopedContext(this.ctx.repos.ctx),
      userId
    );
  }

  async claim(userId: number, eventId: string, kind: PushKind, key: string): Promise<boolean> {
    return this.ctx.repos.push.claimJob(requireScopedContext(this.ctx.repos.ctx), {
      eventId,
      userId,
      kind,
      key,
      createdAt: this.now()
    });
  }

  async settle(key: string, status: "sent" | "failed" | "skipped", error: string | null) {
    return this.ctx.repos.push.settleJob(
      requireScopedContext(this.ctx.repos.ctx),
      key,
      status,
      error,
      this.now()
    );
  }

  async recentKind(userId: number, kind: PushKind, windowSeconds: number): Promise<number> {
    return this.ctx.repos.push.countRecentKind(
      requireScopedContext(this.ctx.repos.ctx),
      userId,
      kind,
      this.now() - windowSeconds
    );
  }

  async deviceSucceeded(deviceId: number): Promise<void> {
    return this.ctx.repos.push.recordDeliverySuccess(
      requireScopedContext(this.ctx.repos.ctx),
      deviceId
    );
  }

  async deviceFailed(deviceId: number, revoke: boolean): Promise<void> {
    return this.ctx.repos.push.recordDeliveryFailure(
      requireScopedContext(this.ctx.repos.ctx),
      deviceId,
      revoke,
      this.now()
    );
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
}

export const pushService = (ctx: ServiceContext): PushService => createService(PushService, ctx);
