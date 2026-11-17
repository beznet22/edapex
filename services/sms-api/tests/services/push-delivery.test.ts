import { describe, expect, it } from "vitest";

import type { PushEvent } from "@edapex/contracts/push";

import type { DeliveryPort } from "../../src/lib/server/services/push/delivery";
import { deliverEvent } from "../../src/lib/server/services/push/delivery";
import type { PushMessage, PushSender, SendOutcome } from "../../src/lib/server/services/push/fcm";

const event: PushEvent = {
  id: "event-1",
  kind: "marks.published",
  schoolId: "1",
  actorUserId: "9",
  audience: { role: "parent", classId: "2" },
  title: "Marks published",
  body: "Results are ready.",
  route: "/marks/exam-1"
};

function fakeService(overrides: Partial<DeliveryPort> = {}): DeliveryPort & {
  settled: { key: string; status: string; error: string | null }[];
  revoked: number[];
} {
  const settled: { key: string; status: string; error: string | null }[] = [];
  const revoked: number[] = [];
  const base = {
    audience: async () => [7],
    claim: async () => true,
    devicesOf: async () => [
      { id: 1, platform: "android" as const, token: "tok", keysJson: null, prefsJson: null, failureCount: 0 }
    ],
    preferencesOf: (prefsJson: string | null) =>
      prefsJson === null
        ? { mutedKinds: [], quietHours: true }
        : (JSON.parse(prefsJson) as { mutedKinds: never[]; quietHours: boolean }),
    settle: async (key: string, status: string, error: string | null) => {
      settled.push({ key, status, error });
    },
    recentKind: async () => 0,
    deviceSucceeded: async () => undefined,
    deviceFailed: async (id: number, revoke: boolean) => {
      if (revoke) revoked.push(id);
    },
    settled,
    revoked
  };
  return Object.assign(base, overrides) as DeliveryPort & typeof base;
}

function fakeSender(outcome: SendOutcome = { ok: true }): PushSender & { sent: PushMessage[] } {
  const sent: PushMessage[] = [];
  return {
    sent,
    send: async (message) => {
      sent.push(message);
      return outcome;
    }
  };
}

// 02:00 UTC: inside quiet hours for everything except an approval.
const QUIET = Date.UTC(2026, 0, 1, 2, 0) / 1000;
const DAY = Date.UTC(2026, 0, 1, 12, 0) / 1000;

describe("delivery", () => {
  it("sends once and settles as sent", async () => {
    const service = fakeService();
    const sender = fakeSender();
    const result = await deliverEvent(service, sender, event, DAY);

    expect(result).toMatchObject({ recipients: 1, delivered: 1, failed: 0 });
    expect(sender.sent).toHaveLength(1);
    expect(service.settled).toEqual([{ key: "event-1:7", status: "sent", error: null }]);
  });

  it("holds a routine push at 02:00 and says why", async () => {
    const service = fakeService();
    const sender = fakeSender();
    const result = await deliverEvent(service, sender, event, QUIET);

    expect(result.skipped).toBe(1);
    expect(sender.sent).toHaveLength(0);
    expect(service.settled[0]).toMatchObject({ status: "skipped", error: "quiet_hours" });
  });

  it("lets an approval through at 02:00, because it blocks work", async () => {
    const service = fakeService();
    const sender = fakeSender();
    await deliverEvent(service, sender, { ...event, kind: "approval.requested" }, QUIET);
    expect(sender.sent).toHaveLength(1);
  });

  it("does not deliver a second time when the claim is taken", async () => {
    const service = fakeService({ claim: async () => false });
    const sender = fakeSender();
    const result = await deliverEvent(service, sender, event, DAY);

    expect(result.skipped).toBe(1);
    expect(sender.sent).toHaveLength(0);
  });

  it("retires a token FCM says is unregistered, and settles failed", async () => {
    const service = fakeService();
    const sender = fakeSender({ ok: false, reason: "unregistered" });
    const result = await deliverEvent(service, sender, event, DAY);

    expect(result.failed).toBe(1);
    expect(service.revoked).toEqual([1]);
    expect(service.settled[0]).toMatchObject({ status: "failed", error: "unregistered" });
  });

  it("skips a person whose every device is muted, without touching transport", async () => {
    const service = fakeService({
      devicesOf: async () => [
        {
          id: 1,
          platform: "android" as const,
          token: "tok",
          keysJson: null,
          prefsJson: JSON.stringify({ mutedKinds: ["marks.published"], quietHours: true }),
          failureCount: 0
        }
      ]
    });
    const sender = fakeSender();
    const result = await deliverEvent(service, sender, event, DAY);

    expect(result.skipped).toBe(1);
    expect(sender.sent).toHaveLength(0);
  });

  it("records a failure rather than pretending, when there is no transport", async () => {
    const service = fakeService();
    const result = await deliverEvent(service, null, event, DAY);

    expect(result.failed).toBe(1);
    expect(service.settled[0]).toMatchObject({ status: "failed", error: "no_transport" });
  });
});
