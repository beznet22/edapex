import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  canRecapture,
  canReExtract,
  isVerified,
} from "$lib/server/people/scan/scan-status";
import { SCAN_STATUSES } from "$lib/server/people/scan/scan-types";

/**
 * Regression tests for defects found in the 2026-11-25 review pass. Each one shipped and was only
 * caught by reading the code, so they are pinned here.
 */

describe("regression: extract must never overwrite a verified marksheet", () => {
  // Found: `extract` had no status guard, so calling it on a `committed` row replaced the
  // teacher's verified marksheet with an unreviewed `draft`.
  it("refuses to re-extract after a teacher has committed", () => {
    expect(canReExtract("committed")).toBe(false);
  });

  it("refuses to re-extract after publish", () => {
    expect(canReExtract("published")).toBe(false);
  });

  it("still allows re-extract while the row is not verified", () => {
    expect(canReExtract("queued")).toBe(true);
    expect(canReExtract("extracting")).toBe(true);
    expect(canReExtract("draft")).toBe(true);
    expect(canReExtract("failed")).toBe(true);
  });

  it("covers every status exactly once", () => {
    const verified = SCAN_STATUSES.filter((status) => !canReExtract(status));
    expect(verified).toEqual(["committed", "published"]);
  });
});

describe("regression: capture must not reset a verified row to queued", () => {
  // Found: `capture` replaced `metadata` unconditionally, dropping a committed marksheet back to
  // `queued` and discarding the teacher's edits.
  it("refuses a new capture on a committed row", () => {
    expect(canRecapture("committed")).toBe(false);
  });

  it("refuses a new capture on a published row", () => {
    expect(canRecapture("published")).toBe(false);
  });

  it("allows the first capture when there is no row yet", () => {
    expect(canRecapture(null)).toBe(true);
    expect(canRecapture("not_uploaded")).toBe(true);
  });

  it("allows Re-scan over a draft, a failure, or a stale capture", () => {
    expect(canRecapture("draft")).toBe(true);
    expect(canRecapture("failed")).toBe(true);
    expect(canRecapture("queued")).toBe(true);
    expect(canRecapture("extracting")).toBe(true);
  });
});

describe("regression: batch publish must not pad with the first student's class", () => {
  // Found: `publishScans` built a single publisher from `loadScanFacts(eligible[0])` and reused it
  // for the whole batch. The publisher reads `tenant.classId`/`sectionId` when padding a
  // marksheet, so every row after the first would be padded with the wrong class's subjects.
  it("groups eligible students by class/section instead of using eligible[0]", async () => {
    const source = await readFile("src/lib/server/people/scan/scan-publish.ts", "utf8");

    expect(source).toContain("byClass");
    expect(source).toContain("facts.classId");
    expect(source).toMatch(/group\.classId/);
    // The old shape must be gone: one facts load feeding one tenant for the whole batch.
    expect(source).not.toMatch(/loadScanFacts\(\{\s*studentId: eligible\[0\]/);
  });

  it("builds one publisher per class inside the loop", async () => {
    const source = await readFile("src/lib/server/people/scan/scan-publish.ts", "utf8");
    const loopAt = source.indexOf("for (const group of byClass.values())");
    const createAt = source.indexOf("createAssessmentPublisherServiceForRequest", loopAt);

    expect(loopAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(loopAt);
  });

  it("still refuses to publish a draft", async () => {
    const source = await readFile("src/lib/server/people/scan/scan-publish.ts", "utf8");
    expect(source).toContain('new Set(["committed"])');
  });
});

describe("regression: offline queue stores the compressed frame", () => {
  // Found: the queue stored the raw capture (~1–2 MB) rather than the 1600 px JPEG (~220 KB),
  // which would exhaust the IndexedDB budget after a handful of pages.
  it("compresses before enqueueing", async () => {
    const source = await readFile(
      "src/routes/(chat)/people/scan/[studentId]/+page.svelte",
      "utf8"
    );
    const offlineAt = source.indexOf("!navigator.onLine");
    const compressAt = source.indexOf("compressScan(file)", offlineAt);
    const enqueueAt = source.indexOf("enqueueCapture", offlineAt);

    expect(offlineAt).toBeGreaterThan(-1);
    expect(compressAt).toBeGreaterThan(offlineAt);
    expect(enqueueAt).toBeGreaterThan(compressAt);
    expect(source).toContain("blob: compressedOffline.file");
  });
});

describe("regression: the viewfinder hands its video element to the parent", () => {
  // Found: the child bound `<video>` to a private prop and never returned it, so the parent's
  // `video` stayed null and the camera never attached. Pinned because a unit test cannot mount
  // a camera, and this was invisible until it ran on a device.
  it("binds the element to the bindable prop, not a private copy", async () => {
    const source = await readFile(
      "src/lib/components/people/scan/scan-viewfinder.svelte",
      "utf8"
    );

    expect(source).toContain("$bindable");
    expect(source).toContain("bind:this={video}");
    expect(source).not.toContain("bind:this={videoEl}");
  });

  it("attaches the stream itself once it owns the element", async () => {
    const source = await readFile(
      "src/lib/components/people/scan/scan-viewfinder.svelte",
      "utf8"
    );
    expect(source).toContain("srcObject = stream");
  });

  it("is bound by the scanner page", async () => {
    const source = await readFile(
      "src/routes/(chat)/people/scan/[studentId]/+page.svelte",
      "utf8"
    );
    expect(source).toContain("bind:video");
    expect(source).toContain("{stream}");
  });
});

describe("isVerified", () => {
  it("names exactly the two human-decided states", () => {
    expect(isVerified("committed")).toBe(true);
    expect(isVerified("published")).toBe(true);
    for (const status of ["queued", "extracting", "draft", "failed", "not_uploaded"] as const) {
      expect(isVerified(status)).toBe(false);
    }
  });
});

describe("regression: leaving the scanner keeps the selected class", () => {
  // Found on a real device: closing the camera returned to `/people?tab=students`, dropping
  // `classId`/`sectionId`. With more than one allowed class the loader's policy is `"single"`,
  // which cannot resolve without a requested class — so admins got "Choose a class" again.
  it("returns to the roster with class, section and exam preserved", async () => {
    const source = await readFile(
      "src/routes/(chat)/people/scan/[studentId]/+page.svelte",
      "utf8"
    );
    const helper = source.slice(source.indexOf("function backToRoster"));

    expect(helper).toContain('params.set("classId"');
    expect(helper).toContain('params.set("sectionId"');
    expect(helper).toContain('params.set("exam"');
  });

  it("no longer navigates to the bare students tab", async () => {
    const source = await readFile(
      "src/routes/(chat)/people/scan/[studentId]/+page.svelte",
      "utf8"
    );
    expect(source).not.toContain('goto("/people?tab=students")');
  });

  it("uses the server-resolved class, so a direct scan URL still returns sensibly", async () => {
    const source = await readFile(
      "src/routes/(chat)/people/scan/[studentId]/+page.svelte",
      "utf8"
    );
    expect(source).toContain("data.student.classId");
    expect(source).toContain("data.student.sectionId");
  });
});

describe("regression: the scanner opens on the student that was tapped", () => {
  // Found on staging: clicking a pupil showed the first row of the class instead, because
  // `activeIndex` was hardcoded to 0 and the URL's student id was never consulted.
  it("seeds the active index from the clicked student, not roster[0]", async () => {
    const source = await readFile(
      "src/routes/(chat)/people/scan/[studentId]/+page.svelte",
      "utf8"
    );

    expect(source).toContain("indexOfStudent");
    expect(source).toContain("data.student.id");
    // The old shape resolved the student purely from index 0.
    expect(source).not.toMatch(/const student = \$derived\(roster\[activeIndex\] \?\? data\.roster\[0\]\);/);
  });

  it("falls back to the clicked student when the roster omits them", async () => {
    const source = await readFile(
      "src/routes/(chat)/people/scan/[studentId]/+page.svelte",
      "utf8"
    );
    expect(source).toContain("?? data.student");
  });
});
