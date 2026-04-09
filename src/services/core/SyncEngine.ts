import { logger } from "../../utils/logger.js";

const log = logger.child({ layer: "service", name: "SyncEngine" });

export interface SyncMutation {
  table: string;
  type: "insert" | "update" | "delete";
  key: string;
  value: any;
  timestamp: string;
}

class SyncEngine {
  private queue: SyncMutation[] = [];
  private debounceTimer: any = null;
  private DEBOUNCE_MS = 5000;

  constructor() {}

  /**
   * Queue a mutation for background synchronization.
   */
  enqueue(mutation: SyncMutation) {
    log.debug("Enqueuing mutation", { table: mutation.table, type: mutation.type });
    this.queue.push(mutation);
    this.scheduleSync();
  }

  private scheduleSync() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.DEBOUNCE_MS);
  }

  private async flush() {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];
    
    log.info("Flushing sync batch", { count: batch.length });

    try {
      // Note: tenantId and userId should be retrieved from session context
      const tenantId = localStorage.getItem("edapex_tenant_id") || "default";
      const userId = localStorage.getItem("edapex_user_id") || "anonymous";

      const response = await fetch("/api/v1/sync/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenantId,
          "x-user-id": userId,
        },
        body: JSON.stringify({
          tenantId,
          userId,
          changes: batch,
        }),
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.statusText}`);
      }

      const result = await response.json();
      log.info("Sync batch flushed successfully", { result });
    } catch (error) {
      log.error("Failed to flush sync batch, requeuing...", { error });
      this.queue = [...batch, ...this.queue]; // Prepend failed batch
      this.scheduleSync(); // Retry
    }
  }
}

export const syncEngine = new SyncEngine();
