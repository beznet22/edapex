/**
 * Idempotency Key Generator — Network Retry Storm Tests
 *
 * Layer 1 Resilience: Simulates network retry storms where the same
 * request is sent multiple times due to packet loss / timeout retries.
 * Verifies deterministic key generation for deduplication.
 */

import { describe, it, expect } from "vitest";
import { generateIdempotencyKey } from "../services/ai/heartbeat.service.js";

describe("idempotency_key_generator — Network Retry Storm Defense", () => {
  it("should generate deterministic keys for the same input within the same time bucket", async () => {
    const timestamp = 1700000000000; // Fixed timestamp

    const key1 = await generateIdempotencyKey("tenant-001", "wakeup", "req-abc", timestamp);
    const key2 = await generateIdempotencyKey("tenant-001", "wakeup", "req-abc", timestamp);

    expect(key1.key).toBe(key2.key);
    expect(key1.bucket).toBe(key2.bucket);
    expect(key1.key).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("should generate different keys for different tenants", async () => {
    const timestamp = 1700000000000;

    const key1 = await generateIdempotencyKey("tenant-001", "wakeup", "req-abc", timestamp);
    const key2 = await generateIdempotencyKey("tenant-002", "wakeup", "req-abc", timestamp);

    expect(key1.key).not.toBe(key2.key);
  });

  it("should generate different keys for different entity types", async () => {
    const timestamp = 1700000000000;

    const key1 = await generateIdempotencyKey("tenant-001", "wakeup", "req-abc", timestamp);
    const key2 = await generateIdempotencyKey("tenant-001", "session", "req-abc", timestamp);

    expect(key1.key).not.toBe(key2.key);
  });

  it("should generate different keys for different natural keys", async () => {
    const timestamp = 1700000000000;

    const key1 = await generateIdempotencyKey("tenant-001", "wakeup", "req-abc", timestamp);
    const key2 = await generateIdempotencyKey("tenant-001", "wakeup", "req-xyz", timestamp);

    expect(key1.key).not.toBe(key2.key);
  });

  it("should generate the same key for timestamps within the same 1-minute bucket", async () => {
    const base = 1700000000000;
    // Both within the same 60-second bucket
    const key1 = await generateIdempotencyKey("tenant-001", "wakeup", "req-abc", base);
    const key2 = await generateIdempotencyKey("tenant-001", "wakeup", "req-abc", base + 30_000); // +30s

    expect(key1.key).toBe(key2.key);
    expect(key1.bucket).toBe(key2.bucket);
  });

  it("should generate different keys for timestamps in different 1-minute buckets", async () => {
    const base = 1700000000000;
    const key1 = await generateIdempotencyKey("tenant-001", "wakeup", "req-abc", base);
    const key2 = await generateIdempotencyKey("tenant-001", "wakeup", "req-abc", base + 61_000); // +61s

    expect(key1.key).not.toBe(key2.key);
    expect(key1.bucket).not.toBe(key2.bucket);
  });

  it("should survive a simulated retry storm — 50 identical requests produce the same key", async () => {
    const timestamp = 1700000000000;
    const keys = await Promise.all(
      Array.from({ length: 50 }, () =>
        generateIdempotencyKey("tenant-001", "account_create", "user-xyz", timestamp),
      ),
    );

    const uniqueKeys = new Set(keys.map((k) => k.key));
    expect(uniqueKeys.size).toBe(1); // All 50 should produce the same key
  });

  it("should produce a valid SHA-256 hex string", async () => {
    const result = await generateIdempotencyKey("t", "e", "n", Date.now());
    expect(result.key).toMatch(/^[0-9a-f]{64}$/);
  });
});
