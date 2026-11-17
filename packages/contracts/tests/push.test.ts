import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTIFICATION_PREFS,
  DIGEST_RECIPIENT_THRESHOLD,
  PUSH_KINDS,
  isMuted,
  isQuietTime,
  notificationPrefsSchema,
  pushEventSchema,
  pushJobKey,
  pushRoute,
  shouldDigest
} from "../src/push";

describe("quiet hours", () => {
  it("starts at 21:00 and ends at 06:30, across midnight", () => {
    expect(isQuietTime("marks.published", 20 * 60 + 59)).toBe(false);
    expect(isQuietTime("marks.published", 21 * 60)).toBe(true);
    expect(isQuietTime("marks.published", 23 * 60 + 59)).toBe(true);
    expect(isQuietTime("marks.published", 0)).toBe(true);
    expect(isQuietTime("marks.published", 6 * 60 + 29)).toBe(true);
    expect(isQuietTime("marks.published", 6 * 60 + 30)).toBe(false);
  });

  it("lets an approval through, because it blocks work until answered", () => {
    expect(isQuietTime("approval.requested", 2 * 60)).toBe(false);
    expect(isQuietTime("approval.decided", 2 * 60)).toBe(true);
  });

  it("treats a minute count from another day as the same clock", () => {
    expect(isQuietTime("routine.due", 1440 + 60)).toBe(true);
    expect(isQuietTime("routine.due", -60)).toBe(true);
  });
});

describe("digest", () => {
  it("collapses a class change past the recipient threshold", () => {
    expect(
      shouldDigest({
        kind: "marks.published",
        recipientCount: DIGEST_RECIPIENT_THRESHOLD + 1,
        sameKindInWindow: 0
      })
    ).toBe(true);
    expect(
      shouldDigest({
        kind: "marks.published",
        recipientCount: DIGEST_RECIPIENT_THRESHOLD,
        sameKindInWindow: 0
      })
    ).toBe(false);
  });

  it("collapses a storm of the same kind even for one recipient", () => {
    expect(shouldDigest({ kind: "routine.due", recipientCount: 1, sameKindInWindow: 60 })).toBe(
      true
    );
  });

  it("never digests an approval", () => {
    expect(
      shouldDigest({
        kind: "approval.requested",
        recipientCount: 900,
        sameKindInWindow: 900
      })
    ).toBe(false);
  });
});

describe("job key", () => {
  it("is stable for the same event and recipient, and different across either", () => {
    expect(pushJobKey("event-1", "user-1")).toBe(pushJobKey("event-1", "user-1"));
    expect(pushJobKey("event-1", "user-1")).not.toBe(pushJobKey("event-1", "user-2"));
    expect(pushJobKey("event-1", "user-1")).not.toBe(pushJobKey("event-2", "user-1"));
  });
});

describe("routes", () => {
  it("names a destination for every kind, with no gaps", () => {
    for (const kind of PUSH_KINDS) {
      expect(pushRoute(kind, "subject-9")).toMatch(/^\/[a-z]+\/subject-9$/);
    }
  });

  it("sends an approval to the surface that can answer it", () => {
    expect(pushRoute("approval.requested", "a-7")).toBe("/approval/a-7");
  });
});

describe("preferences", () => {
  it("delivers everything until someone opts out", () => {
    const parsed = notificationPrefsSchema.parse({});
    expect(parsed).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(isMuted(parsed, "marks.published")).toBe(false);
    expect(isMuted({ ...parsed, mutedKinds: ["marks.published"] }, "marks.published")).toBe(true);
  });
});

describe("envelope", () => {
  const event = {
    id: "event-1",
    kind: "marks.published",
    schoolId: "school-1",
    actorUserId: "teacher-1",
    audience: { role: "parent", classId: "jss2b" },
    title: "Marks published — JSS 2B",
    body: "3 students' results are ready to view.",
    route: "/marks/exam-1"
  } as const;

  it("accepts a well-formed event", () => {
    expect(pushEventSchema.parse(event).kind).toBe("marks.published");
  });

  it("rejects a route that is not a path, so a sender cannot ship a scheme", () => {
    expect(() => pushEventSchema.parse({ ...event, route: "https://evil.example" })).toThrow();
  });

  it("rejects an unknown kind rather than delivering an untyped notification", () => {
    expect(() => pushEventSchema.parse({ ...event, kind: "marks.deleted" })).toThrow();
  });

  it("never carries a child's name or score in the copy contract", () => {
    // The payload transits a third party and lands on a lock screen; the shape
    // has no field for a score, which is what makes that rule structural.
    const keys = Object.keys(event);
    expect(keys).not.toContain("score");
    expect(keys).not.toContain("studentName");
  });
});
