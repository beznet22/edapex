import { describe, expect, it } from "vitest";
import {
  countScanStatuses,
  resolveScanStatus,
  shouldPoll,
  type ScanStatusMap,
} from "$lib/server/people/scan/scan-status";
import { advanceEnvelope, createEnvelope, type ScanEnvelope } from "$lib/server/people/scan/scan-types";

const document = { path: "p/abc.jpg", bytes: 1000, width: 1600, height: 2260 };
const at = (iso: string) => new Date(iso);

const envelopeWith = (
  status: ScanEnvelope["status"],
  queuedAt = "2026-11-25T10:00:00.000Z"
): ScanEnvelope => {
  const base = createEnvelope({
    captureId: "cap-1",
    document,
    now: at(queuedAt),
  });
  return advanceEnvelope(base, { status }, at(queuedAt));
};

const none = { hasResultRows: false, hasPublishedTimeline: false };

describe("resolveScanStatus", () => {
  it("is not_uploaded with no envelope and no result rows", () => {
    expect(resolveScanStatus({ envelope: null, ...none })).toBe("not_uploaded");
  });

  it("is committed from result rows alone — pre-existing marks predate the scanner", () => {
    expect(
      resolveScanStatus({ envelope: null, hasResultRows: true, hasPublishedTimeline: false })
    ).toBe("committed");
  });

  it("is published from a visible timeline row even with no envelope", () => {
    expect(
      resolveScanStatus({ envelope: null, hasResultRows: true, hasPublishedTimeline: true })
    ).toBe("published");
  });

  it("passes through each envelope status verbatim", () => {
    for (const status of ["queued", "extracting", "draft", "committed", "published", "failed"] as const) {
      expect(
        resolveScanStatus({
          envelope: envelopeWith(status),
          ...none,
          now: at("2026-11-25T10:01:00.000Z"),
        })
      ).toBe(status);
    }
  });

  it("demotes a stale queued envelope to failed", () => {
    expect(
      resolveScanStatus({
        envelope: envelopeWith("queued"),
        ...none,
        now: at("2026-11-25T10:30:00.000Z"),
      })
    ).toBe("failed");
  });

  it("keeps a queued envelope queued inside the window", () => {
    expect(
      resolveScanStatus({
        envelope: envelopeWith("queued"),
        ...none,
        now: at("2026-11-25T10:02:00.000Z"),
      })
    ).toBe("queued");
  });

  it("does not demote a stale extracting envelope — that is a live server job", () => {
    expect(
      resolveScanStatus({
        envelope: envelopeWith("extracting"),
        ...none,
        now: at("2026-11-26T10:00:00.000Z"),
      })
    ).toBe("extracting");
  });

  it("lets published beat a committed envelope", () => {
    expect(
      resolveScanStatus({
        envelope: envelopeWith("committed"),
        hasResultRows: true,
        hasPublishedTimeline: true,
      })
    ).toBe("published");
  });

  it("lets a failed envelope beat existing result rows — the draft is not current", () => {
    expect(
      resolveScanStatus({
        envelope: envelopeWith("failed"),
        hasResultRows: true,
        hasPublishedTimeline: false,
      })
    ).toBe("failed");
  });

  it("lets a draft beat committed when a result row already exists", () => {
    expect(
      resolveScanStatus({
        envelope: envelopeWith("draft"),
        hasResultRows: true,
        hasPublishedTimeline: false,
      })
    ).toBe("draft");
  });
});

const mapOf = (entries: [number, ScanStatusMap extends Map<number, infer V> ? V : never][]) =>
  new Map(entries) as ScanStatusMap;

describe("countScanStatuses", () => {
  it("counts queued and extracting together as pending", () => {
    const counts = countScanStatuses(
      mapOf([
        [1, "queued"],
        [2, "extracting"],
        [3, "draft"],
        [4, "draft"],
        [5, "committed"],
        [6, "published"],
        [7, "failed"],
        [8, "not_uploaded"],
      ])
    );
    expect(counts).toEqual({ pending: 2, drafts: 2, committed: 1, published: 1, failed: 1 });
  });

  it("returns all zeros for an empty map", () => {
    expect(countScanStatuses(new Map())).toEqual({
      pending: 0,
      drafts: 0,
      committed: 0,
      published: 0,
      failed: 0,
    });
  });
});

describe("shouldPoll", () => {
  it("polls only while a row is in flight", () => {
    expect(shouldPoll(mapOf([[1, "queued"]]))).toBe(true);
    expect(shouldPoll(mapOf([[1, "extracting"]]))).toBe(true);
    expect(shouldPoll(mapOf([[1, "draft"], [2, "committed"]]))).toBe(false);
    expect(shouldPoll(new Map())).toBe(false);
  });

  it("does not poll for terminal failure — Retry is an explicit user action", () => {
    expect(shouldPoll(mapOf([[1, "failed"]]))).toBe(false);
  });
});
