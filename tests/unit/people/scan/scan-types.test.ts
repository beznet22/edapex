import { describe, expect, it } from "vitest";
import {
  advanceEnvelope,
  createEnvelope,
  emptyValidation,
  isBusyStatus,
  isFailureStatus,
  isStaleQueued,
  parseEnvelope,
  SCAN_STATUSES,
  SCAN_UI_LABELS,
  serializeEnvelope,
  STALE_QUEUED_MS,
} from "$lib/server/people/scan/scan-types";

const document = { path: "storage/marks-scans/1/2/3/4/abc.jpg", bytes: 210_000, width: 1600, height: 2260 };
const capture = (now?: Date) => createEnvelope({ captureId: "cap-1", document, now });

describe("createEnvelope", () => {
  it("starts queued with a null failure and no marksheet", () => {
    const envelope = capture(new Date("2026-11-25T10:00:00.000Z"));
    expect(envelope.status).toBe("queued");
    expect(envelope.failure).toBeNull();
    expect(envelope.marksheet).toBeNull();
    expect(envelope.extraction).toBeNull();
    expect(envelope.capturedAt).toBe("2026-11-25T10:00:00.000Z");
    expect(envelope.queuedAt).toBe("2026-11-25T10:00:00.000Z");
    expect(envelope.validation).toEqual(emptyValidation());
  });
});

describe("serializeEnvelope / parseEnvelope", () => {
  it("round-trips a queued envelope", () => {
    const envelope = capture();
    expect(parseEnvelope(serializeEnvelope(envelope))).toEqual(envelope);
  });

  it("treats null, empty and legacy non-JSON as absent", () => {
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope(undefined)).toBeNull();
    expect(parseEnvelope("")).toBeNull();
    expect(parseEnvelope("plain teacher remark")).toBeNull();
    expect(parseEnvelope("{}")).toBeNull();
  });

  it("rejects an envelope with a missing required key", () => {
    const envelope = capture();
    const broken = { ...envelope } as Record<string, unknown>;
    delete broken.captureId;
    expect(parseEnvelope(JSON.stringify(broken))).toBeNull();
  });

  it("rejects an unknown status", () => {
    expect(parseEnvelope(JSON.stringify({ ...capture(), status: "nope" }))).toBeNull();
  });

  it("rejects a future envelope version", () => {
    expect(parseEnvelope(JSON.stringify({ ...capture(), v: 2 }))).toBeNull();
  });
});

describe("advanceEnvelope", () => {
  it("clears failure when advancing to a non-failed status", () => {
    const failed = advanceEnvelope(capture(), {
      status: "failed",
      failure: { message: "boom", code: "EXTRACT_FAILED", at: "2026-11-25T10:01:00.000Z" },
    });
    expect(failed.failure).not.toBeNull();
    const retried = advanceEnvelope(failed, { status: "extracting" });
    expect(retried.status).toBe("extracting");
    expect(retried.failure).toBeNull();
  });

  it("keeps the captureId immutable", () => {
    const advanced = advanceEnvelope(capture(), { status: "draft", captureId: "hijacked" } as never);
    expect(advanced.captureId).toBe("cap-1");
  });

  it("stamps updatedAt", () => {
    const at = new Date("2026-11-25T11:00:00.000Z");
    expect(advanceEnvelope(capture(), { status: "draft" }, at).updatedAt).toBe(at.toISOString());
  });
});

describe("isStaleQueued", () => {
  const base = new Date("2026-11-25T10:00:00.000Z");

  it("is false for a fresh queued row", () => {
    expect(isStaleQueued(capture(base), { now: new Date("2026-11-25T10:05:00.000Z") })).toBe(false);
  });

  it("is true past the 10 minute window", () => {
    const later = new Date(base.getTime() + STALE_QUEUED_MS + 1);
    expect(isStaleQueued(capture(base), { now: later })).toBe(true);
  });

  it("is false for non-queued statuses even when old", () => {
    const old = new Date("2026-11-25T10:00:00.000Z");
    const draft = advanceEnvelope(capture(old), { status: "draft" }, old);
    expect(isStaleQueued(draft, { now: new Date("2026-11-26T10:00:00.000Z") })).toBe(false);
  });
});

describe("status vocabulary", () => {
  it("labels every status exactly once", () => {
    const labels = ["not_uploaded", ...SCAN_STATUSES].map((key) => SCAN_UI_LABELS[key as keyof typeof SCAN_UI_LABELS]);
    expect(labels).toEqual([
      "Not Uploaded",
      "Queued",
      "Extracting…",
      "Draft",
      "Uploaded",
      "Published",
      "Error",
    ]);
  });

  it("maps committed to Uploaded and failed to Error", () => {
    expect(SCAN_UI_LABELS.committed).toBe("Uploaded");
    expect(SCAN_UI_LABELS.failed).toBe("Error");
  });

  it("classifies busy and failure states", () => {
    expect(isBusyStatus("queued")).toBe(true);
    expect(isBusyStatus("extracting")).toBe(true);
    expect(isBusyStatus("draft")).toBe(false);
    expect(isFailureStatus("failed")).toBe(true);
    expect(isFailureStatus("committed")).toBe(false);
  });
});
