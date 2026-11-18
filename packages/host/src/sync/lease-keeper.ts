import type { SessionLease } from "@edapex/contracts";

import { RelayError, type SessionRelayClient } from "./relay-client";

/**
 * Holds the relay lease for a session across sync passes.
 *
 * Renewing early is deliberate: a pass that outlives the TTL would start
 * answering `stale` mid-batch, and the fence is what the service trusts, not the
 * wall clock on this device.
 */
export class LeaseKeeper {
  private current: SessionLease | null = null;
  private readonly client: SessionRelayClient;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly renewBeforeMs: number;

  constructor(client: SessionRelayClient, ttlMs: number, now: () => number = () => Date.now()) {
    this.client = client;
    this.ttlMs = ttlMs;
    this.now = now;
    this.renewBeforeMs = Math.floor(ttlMs / 3);
  }

  get fence(): number | null {
    return this.current?.fence ?? null;
  }

  /** The current lease, renewed if it is close to expiry, else acquired. */
  async ensure(): Promise<SessionLease> {
    const lease = this.current;
    if (lease === null) return this.acquire();
    if (lease.expiresAtMs - this.now() > this.renewBeforeMs) return lease;

    try {
      this.current = await this.client.renewLease(lease.fence);
      return this.current;
    } catch (error) {
      // Losing the lease is not a transport failure: take it back if it is free,
      // otherwise surface the holder conflict to the caller.
      if (error instanceof RelayError && (error.code === "lease_stale" || error.code === "lease_held")) {
        return this.acquire();
      }
      throw error;
    }
  }

  /** Drops the cached lease so the next `ensure` re-acquires and gets a new fence. */
  forget(): void {
    this.current = null;
  }

  async acquire(): Promise<SessionLease> {
    this.current = await this.client.acquireLease(this.ttlMs);
    return this.current;
  }

  async release(): Promise<void> {
    const lease = this.current;
    if (lease === null) return;
    this.current = null;
    await this.client.releaseLease(lease.fence);
  }
}
