import {
  isMuted,
  isQuietTime,
  pushJobKey,
  pushRoute,
  shouldDigest
} from "@edapex/contracts/push";
import type { PushEvent } from "@edapex/contracts/push";

import type { ActiveDevice } from "../../repository/push";
import type { PushSender } from "./fcm";
import type { NotificationPrefs, PushKind } from "@edapex/contracts/push";

/**
 * What delivery needs from the service, named so a test can stand in for it.
 *
 * A fake here asserts the decision — skip, digest, retire this token — without a
 * D1 instance, which is the difference between a test that runs and a test that
 * is skipped in CI.
 */
export interface DeliveryPort {
  audience(event: PushEvent): Promise<readonly number[]>;
  claim(userId: number, eventId: string, kind: PushKind, key: string): Promise<boolean>;
  devicesOf(userId: number): Promise<readonly ActiveDevice[]>;
  preferencesOf(prefsJson: string | null): NotificationPrefs;
  settle(key: string, status: "sent" | "failed" | "skipped", error: string | null): Promise<void>;
  recentKind(userId: number, kind: PushKind, windowSeconds: number): Promise<number>;
  deviceSucceeded(deviceId: number): Promise<void>;
  deviceFailed(deviceId: number, revoke: boolean): Promise<void>;
}

export interface DeliveryResult {
  readonly recipients: number;
  readonly delivered: number;
  readonly skipped: number;
  readonly failed: number;
}

/**
 * One event, fanned out to the people it is for.
 *
 * Every decision is per recipient, and every recipient is claimed before a byte
 * is sent: an event that arrives twice notifies once, and a retry after a
 * partial failure only touches the people who have no job yet.
 *
 * Quiet hours are school-local in the plan and UTC here, because the school
 * schema carries no timezone column yet. That is a known gap, not an oversight:
 * a 21:00 boundary is wrong by at most the school's UTC offset.
 */
export async function deliverEvent(
  service: DeliveryPort,
  sender: PushSender | null,
  event: PushEvent,
  now: number
): Promise<DeliveryResult> {
  const recipients = await service.audience(event);
  const localMinutes = new Date(now * 1000).getUTCHours() * 60 + new Date(now * 1000).getUTCMinutes();
  const route = pushRoute(event.kind, event.params?.["subjectId"] ?? event.id);

  let delivered = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of recipients) {
    const key = pushJobKey(event.id, String(userId));
    const claimed = await service.claim(userId, event.id, event.kind, key);
    if (!claimed) {
      skipped += 1;
      continue;
    }

    const devices = await service.devicesOf(userId);
    const live = devices.filter((device) => !isMuted(service.preferencesOf(device.prefsJson), event.kind));
    if (live.length === 0) {
      await service.settle(key, "skipped", "no_devices");
      skipped += 1;
      continue;
    }
    if (isQuietTime(event.kind, localMinutes)) {
      await service.settle(key, "skipped", "quiet_hours");
      skipped += 1;
      continue;
    }
    const sameKind = await service.recentKind(userId, event.kind, 60);
    if (shouldDigest({ kind: event.kind, recipientCount: recipients.length, sameKindInWindow: sameKind })) {
      await service.settle(key, "skipped", "digest");
      skipped += 1;
      continue;
    }
    if (sender === null) {
      await service.settle(key, "failed", "no_transport");
      failed += 1;
      continue;
    }

    let anySent = false;
    let lastError: string | null = null;
    for (const device of live) {
      if (device.platform !== "android") {
        // Web Push and APNs land in their own transport; the row still exists so
        // the decision is recorded rather than silently dropped.
        lastError = "unsupported_platform";
        continue;
      }
      const outcome = await sender.send({
        token: device.token,
        title: event.title,
        body: event.body,
        data: { kind: event.kind, route, eventId: event.id }
      });
      if (outcome.ok) {
        anySent = true;
        await service.deviceSucceeded(device.id);
      } else {
        lastError = outcome.reason === "unregistered" ? "unregistered" : outcome.message;
        await service.deviceFailed(device.id, outcome.reason === "unregistered");
      }
    }

    if (anySent) {
      delivered += 1;
      await service.settle(key, "sent", lastError);
    } else {
      failed += 1;
      await service.settle(key, "failed", lastError ?? "unknown");
    }
  }

  return { recipients: recipients.length, delivered, skipped, failed };
}
