import assert from "node:assert/strict";
import test from "node:test";

import { encodeIco, readIcoEntries } from "./ico.mjs";

const payload = (tag) => Buffer.from(`PNG-${tag}`);

const entries = [
  { size: 16, png: payload("16") },
  { size: 32, png: payload("32") },
  { size: 48, png: payload("48") },
  { size: 256, png: payload("256") }
];

test("the header declares a PNG-compressed icon set", () => {
  const buffer = encodeIco(entries);
  assert.equal(buffer.readUInt16LE(0), 0, "reserved");
  assert.equal(buffer.readUInt16LE(2), 1, "type");
  assert.equal(buffer.readUInt16LE(4), entries.length, "image count");
});

test("every directory offset lands on its own payload", () => {
  for (const entry of readIcoEntries(encodeIco(entries))) {
    assert.equal(entry.png.toString(), `PNG-${entry.size}`);
  }
});

test("256 is written as zero in the one-byte dimension field and read back as 256", () => {
  const buffer = encodeIco(entries);
  const last = 6 + 16 * (entries.length - 1);
  assert.equal(buffer.readUInt8(last), 0);
  assert.equal(readIcoEntries(buffer).at(-1).size, 256);
});

test("the payloads are contiguous and the file length is the sum of its parts", () => {
  const buffer = encodeIco(entries);
  const parsed = readIcoEntries(buffer);
  const payloadBytes = parsed.reduce((total, entry) => total + entry.bytes, 0);
  assert.equal(buffer.length, 6 + 16 * entries.length + payloadBytes);
  assert.equal(parsed[0].offset, 6 + 16 * entries.length);
  parsed.slice(1).forEach((entry, index) => {
    assert.equal(entry.offset, parsed[index].offset + parsed[index].bytes);
  });
});

test("a truncated file is rejected rather than read past its end", () => {
  const buffer = encodeIco(entries);
  assert.throws(() => readIcoEntries(buffer.subarray(0, buffer.length - 4)), /past the file/);
});

test("an empty set is an error, not a header with no images", () => {
  assert.throws(() => encodeIco([]), /at least one/);
});
