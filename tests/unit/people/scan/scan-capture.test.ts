import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CaptureRejectedError,
  MAX_CAPTURE_BYTES,
  prepareCapture,
  readJpegDimensions,
  sniffImageKind,
  stripJpegMetadata,
  stripPngMetadata,
} from "$lib/server/people/scan/scan-capture";
import { parseEnvelope } from "$lib/server/people/scan/scan-types";

const hasApp1 = (bytes: Buffer): boolean => {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1];
    if (marker === 0xda) return false;
    if (marker === 0xe1) return true;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return false;
    offset += 2 + length;
  }
  return false;
};

const pngWithText = (): Buffer => {
  const chunk = (type: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    return Buffer.concat([head, data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("tEXt", Buffer.from("Author\0secret")),
    chunk("IDAT", Buffer.from([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01])),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

describe("sniffImageKind", () => {
  it("detects JPEG and PNG by magic bytes", async () => {
    const jpeg = await readFile("static/marksheets/LB2B/Amira.jpg.jpeg");
    expect(sniffImageKind(jpeg)).toBe("image/jpeg");
    expect(sniffImageKind(pngWithText())).toBe("image/png");
  });

  it("rejects anything else, including a PDF masquerading as an image", () => {
    expect(sniffImageKind(Buffer.from("%PDF-1.7\n"))).toBeNull();
    expect(sniffImageKind(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffImageKind(Buffer.alloc(0))).toBeNull();
  });
});

describe("stripJpegMetadata", () => {
  it("removes the EXIF APP1 segment from a real phone-style JPEG", async () => {
    const original = await readFile("static/marksheets/CRECHE_A/brian.jpg.jpeg");
    const cleaned = stripJpegMetadata(original);

    expect(cleaned.length).toBeLessThan(original.length);
    expect(cleaned[0]).toBe(0xff);
    expect(cleaned[1]).toBe(0xd8);
    expect(readJpegDimensions(cleaned)).not.toBeNull();
  });

  it("is idempotent — a second pass changes nothing", async () => {
    const original = await readFile("static/marksheets/CRECHE_A/brian.jpg.jpeg");
    const once = stripJpegMetadata(original);
    expect(stripJpegMetadata(once).equals(once)).toBe(true);
  });

  it("keeps the image decodable by preserving dimensions", async () => {
    const original = await readFile("static/marksheets/LB2B/Amira.jpg.jpeg");
    const before = readJpegDimensions(original);
    const after = readJpegDimensions(stripJpegMetadata(original));
    expect(after).toEqual(before);
  });

  it("rejects a non-JPEG buffer", () => {
    expect(() => stripJpegMetadata(Buffer.from("not a jpeg"))).toThrow(CaptureRejectedError);
  });
});

describe("stripPngMetadata", () => {
  it("drops tEXt chunks but keeps IHDR/IDAT/IEND", () => {
    const cleaned = stripPngMetadata(pngWithText());
    expect(cleaned.toString("ascii")).not.toContain("Author");
    expect(cleaned.toString("ascii")).toContain("IHDR");
    expect(cleaned.toString("ascii")).toContain("IDAT");
    expect(cleaned.toString("ascii")).toContain("IEND");
  });
});

describe("readJpegDimensions", () => {
  it("reads the SOF dimensions of a real scan", async () => {
    const jpeg = await readFile("static/marksheets/LB2B/Amira.jpg.jpeg");
    const dims = readJpegDimensions(jpeg);
    expect(dims).not.toBeNull();
    expect(dims!.width).toBe(818);
    expect(dims!.height).toBe(1211);
  });

  it("returns null for a PNG", () => {
    expect(readJpegDimensions(pngWithText())).toBeNull();
  });
});

describe("prepareCapture", () => {
  const base = {
    studentId: 900,
    examTypeId: 2,
    schoolId: 1,
    academicId: 4,
    classId: 5,
    sectionId: 12,
    source: "camera" as const,
  };

  it("rejects an oversized upload before touching the filesystem", async () => {
    const huge = Buffer.alloc(MAX_CAPTURE_BYTES + 1);
    huge[0] = 0xff;
    huge[1] = 0xd8;
    huge[2] = 0xff;
    await expect(prepareCapture({ ...base, bytes: huge })).rejects.toMatchObject({
      code: "TOO_LARGE",
    });
  });

  it("rejects an empty upload", async () => {
    await expect(prepareCapture({ ...base, bytes: Buffer.alloc(0) })).rejects.toMatchObject({
      code: "NOT_AN_IMAGE",
    });
  });

  it("rejects a non-image with a valid-looking name", async () => {
    await expect(
      prepareCapture({ ...base, bytes: Buffer.from("<?php echo 1; ?>") })
    ).rejects.toMatchObject({ code: "NOT_AN_IMAGE" });
  });

  it("produces a queued envelope with a deterministic path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scan-capture-"));
    try {
      const jpeg = await readFile("static/marksheets/LB2B/Amira.jpg.jpeg");
      const result = await prepareCapture({
        ...base,
        bytes: jpeg,
        captureId: "capture-abc_123",
        cwd,
      });

      const envelope = parseEnvelope(result.metadata);
      expect(envelope?.status).toBe("queued");
      expect(envelope?.captureId).toBe("capture-abc_123");
      expect(result.path).toBe("storage/marks-scans/1/4/2/900/capture-abc_123.jpg");
      expect(result.kind).toBe("image/jpeg");
      // The benchmark images are already compressor output, so they carry no EXIF to remove.
      expect(result.bytes).toBeLessThanOrEqual(jpeg.length);
      expect(envelope?.document?.width).toBe(818);
      expect(envelope?.document?.height).toBe(1211);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite an existing capture id", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "scan-capture-"));
    try {
      const jpeg = await readFile("static/marksheets/LB2B/Amira.jpg.jpeg");
      const input = { ...base, bytes: jpeg, captureId: "same-id", cwd };
      await prepareCapture(input);
      await expect(prepareCapture(input)).rejects.toThrow();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
