/**
 * ICO writer.
 *
 * sharp cannot emit ICO and `tauri icon` would write into `gen/android` as a side effect, so
 * the container is built here: a six-byte header, one sixteen-byte directory entry per image,
 * then the PNG payloads. Windows has accepted PNG-compressed entries since Vista, so there is
 * no BMP fallback to maintain.
 */
const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;

/** 256 is encoded as 0 in a directory entry: the field is one byte. */
const dimension = (size) => (size >= 256 ? 0 : size);

export const encodeIco = (entries) => {
  if (entries.length === 0) throw new Error("an ICO needs at least one image");
  if (entries.length > 255) throw new Error("an ICO holds at most 255 images");

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(ENTRY_BYTES * entries.length);
  let offset = HEADER_BYTES + directory.length;

  entries.forEach((entry, index) => {
    const at = index * ENTRY_BYTES;
    directory.writeUInt8(dimension(entry.size), at);
    directory.writeUInt8(dimension(entry.size), at + 1);
    directory.writeUInt8(0, at + 2);
    directory.writeUInt8(0, at + 3);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(entry.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += entry.png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.png)]);
};

export const readIcoEntries = (buffer) => {
  if (buffer.readUInt16LE(0) !== 0 || buffer.readUInt16LE(2) !== 1) {
    throw new Error("not an ICO: reserved or type field is wrong");
  }
  const count = buffer.readUInt16LE(4);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const at = HEADER_BYTES + index * ENTRY_BYTES;
    const width = buffer.readUInt8(at) || 256;
    const height = buffer.readUInt8(at + 1) || 256;
    const bytes = buffer.readUInt32LE(at + 8);
    const offset = buffer.readUInt32LE(at + 12);
    if (offset + bytes > buffer.length) throw new Error(`ICO entry ${index} runs past the file`);
    entries.push({ size: width, height, bytes, offset, png: buffer.subarray(offset, offset + bytes) });
  }
  return entries;
};
