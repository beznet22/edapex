import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createArchiveStore } from "../../src/lib/server/services/adapters/r2-archive-store.adapter";
import { PortError } from "../../src/lib/server/services/errors";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe("R2 archive store", () => {
  it("puts, reads, lists and deletes an object", async () => {
    const store = createArchiveStore(env.MEDIA);
    const key = "tests/archive-store/school-1/session-1/student-1/v1.json";
    const payload = encoder.encode(JSON.stringify({ schemaVersion: 1 }));

    await store.put(key, payload);
    const read = await store.get(key);
    expect(read).not.toBeNull();
    expect(decoder.decode(read ?? new Uint8Array())).toBe(
      JSON.stringify({ schemaVersion: 1 })
    );

    const listed = await store.list("tests/archive-store/school-1/");
    expect(listed.map((entry) => entry.key)).toContain(key);

    await store.delete(key);
    await expect(store.get(key)).resolves.toBeNull();
    await expect(store.list("tests/archive-store/school-1/")).resolves.toEqual([]);
  });

  it("returns null for a missing key instead of throwing", async () => {
    const store = createArchiveStore(env.MEDIA);
    await expect(store.get("tests/archive-store/missing.json")).resolves.toBeNull();
  });

  it("fails explicitly when the binding is absent", async () => {
    const store = createArchiveStore(undefined);
    await expect(store.get("any")).rejects.toBeInstanceOf(PortError);
  });
});
