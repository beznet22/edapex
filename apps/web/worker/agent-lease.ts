/**
 * Cross-tab exclusivity through the Web Locks API.
 *
 * The lock is acquired inside the worker, held for the runtime's whole life, and
 * released only after storage is closed. `ifAvailable` makes ownership an
 * immediate decision rather than a queue: a second tab must learn it is a
 * follower now, not block until the first tab exits.
 *
 * Deliberately not a heartbeat. A lock held by a terminated worker is released
 * by the browser, which no timer-based scheme can guarantee.
 */
import { failure, lockNameFor, type AgentFailure } from "./agent-lifecycle";

export interface Lease {
  /** Resolves once storage has closed; the lock is released when it settles. */
  readonly release: () => Promise<void>;
}

export type LeaseOutcome =
  | { readonly kind: "owned"; readonly lease: Lease }
  | { readonly kind: "unavailable"; readonly reason: AgentFailure };

export async function acquireExclusiveLease(directory: string): Promise<LeaseOutcome> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (locks === undefined) {
    return {
      kind: "unavailable",
      reason: failure(
        "unsupported_capability",
        "This browser cannot coordinate sessions across tabs (Web Locks is unavailable)."
      )
    };
  }

  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let settle!: (owned: boolean) => void;
  const decision = new Promise<boolean>((resolve) => { settle = resolve; });

  // The callback's promise is the lifetime of the lock: it resolves only when
  // `held` does, so ownership cannot lapse while the runtime is alive.
  const task = locks.request(
    lockNameFor(directory),
    { mode: "exclusive", ifAvailable: true },
    async (lock: Lock | null) => {
      const owned = lock !== null;
      settle(owned);
      if (owned) await held;
    }
  );

  if (!(await decision)) {
    await task.catch(() => undefined);
    return {
      kind: "unavailable",
      reason: failure(
        "lease_locked",
        "This session is open in another tab. Close it there to take over here.",
        true
      )
    };
  }

  return {
    kind: "owned",
    lease: {
      async release(): Promise<void> {
        release();
        await task.catch(() => undefined);
      }
    }
  };
}
