/**
 * ICNS writer.
 *
 * A flat container: `icns`, a big-endian total length, then typed elements whose length
 * includes their own eight-byte header. Only PNG elements are written (`icp4`…`ic10`), which
 * is what macOS has read since 10.7 and what `iconutil` produces for high-resolution art.
 *
 * The legacy `is32`/`il32`/`s8mk` bitmap elements are deliberately absent: adding them would
 * mean shipping a second, lower-quality copy of every icon for no current consumer.
 */
const MAGIC = "icns";
const HEADER_BYTES = 8;
const ELEMENT_BYTES = 8;

export const encodeIcns = (entries) => {
  if (entries.length === 0) throw new Error("an ICNS needs at least one image");

  const elements = entries.map((entry) => {
    if (!/^[a-z0-9]{4}$/.test(entry.type)) {
      throw new Error(`ICNS element type must be four characters, got "${entry.type}"`);
    }
    const header = Buffer.alloc(ELEMENT_BYTES);
    header.write(entry.type, 0, 4, "ascii");
    header.writeUInt32BE(entry.png.length + ELEMENT_BYTES, 4);
    return Buffer.concat([header, entry.png]);
  });

  const payload = Buffer.concat(elements);
  const header = Buffer.alloc(HEADER_BYTES);
  header.write(MAGIC, 0, 4, "ascii");
  header.writeUInt32BE(payload.length + HEADER_BYTES, 4);
  return Buffer.concat([header, payload]);
};

export const readIcnsEntries = (buffer) => {
  if (buffer.subarray(0, 4).toString("ascii") !== MAGIC) throw new Error("not an ICNS: bad magic");
  const declared = buffer.readUInt32BE(4);
  if (declared !== buffer.length) {
    throw new Error(`ICNS declares ${declared} bytes but the file is ${buffer.length}`);
  }

  const entries = [];
  let at = HEADER_BYTES;
  while (at < buffer.length) {
    if (at + ELEMENT_BYTES > buffer.length) throw new Error("ICNS element header runs past the file");
    const type = buffer.subarray(at, at + 4).toString("ascii");
    const length = buffer.readUInt32BE(at + 4);
    if (length < ELEMENT_BYTES || at + length > buffer.length) {
      throw new Error(`ICNS element ${type} declares an impossible length ${length}`);
    }
    entries.push({ type, bytes: length, png: buffer.subarray(at + ELEMENT_BYTES, at + length) });
    at += length;
  }
  return entries;
};
