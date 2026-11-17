import assert from "node:assert/strict";
import test from "node:test";

import { encodeIcns, readIcnsEntries } from "./icns.mjs";

const entries = [
  { type: "icp4", png: Buffer.from("PNG-16") },
  { type: "icp5", png: Buffer.from("PNG-32") },
  { type: "ic07", png: Buffer.from("PNG-128") },
  { type: "ic10", png: Buffer.from("PNG-1024") }
];

test("the magic and the declared length agree with the file", () => {
  const buffer = encodeIcns(entries);
  assert.equal(buffer.subarray(0, 4).toString("ascii"), "icns");
  assert.equal(buffer.readUInt32BE(4), buffer.length);
});

test("each element carries a length that includes its own header", () => {
  const parsed = readIcnsEntries(encodeIcns(entries));
  assert.deepEqual(parsed.map((entry) => entry.type), entries.map((entry) => entry.type));
  parsed.forEach((entry, index) => {
    assert.equal(entry.bytes, entries[index].png.length + 8);
    assert.equal(entry.png.toString(), entries[index].png.toString());
  });
});

test("element offsets tile the payload without gaps", () => {
  const buffer = encodeIcns(entries);
  const parsed = readIcnsEntries(buffer);
  const payload = parsed.reduce((total, entry) => total + entry.bytes, 0);
  assert.equal(payload + 8, buffer.length);
});

test("a wrong magic is rejected", () => {
  const buffer = encodeIcns(entries);
  buffer.write("icts", 0, 4, "ascii");
  assert.throws(() => readIcnsEntries(buffer), /bad magic/);
});

test("a lying total length is rejected", () => {
  const buffer = encodeIcns(entries);
  buffer.writeUInt32BE(buffer.length + 4, 4);
  assert.throws(() => readIcnsEntries(buffer), /declares/);
});

test("an element type that is not four characters is refused before writing", () => {
  assert.throws(() => encodeIcns([{ type: "ic10x", png: Buffer.from("x") }]), /four characters/);
});

test("a zero-length element is refused rather than producing an infinite loop", () => {
  const buffer = Buffer.concat([Buffer.from("icns"), Buffer.alloc(4), Buffer.from("icp4"), Buffer.alloc(4)]);
  buffer.writeUInt32BE(buffer.length, 4);
  assert.throws(() => readIcnsEntries(buffer), /impossible length/);
});
