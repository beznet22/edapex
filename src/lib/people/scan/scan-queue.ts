/**
 * Offline capture queue (plan Gate 3).
 *
 * IndexedDB holds the JPEG blob plus its target, so a capture survives losing signal, closing the
 * tab, or the phone dying mid-lesson. Replay goes through the **same** `capture -> extract` pair as
 * the online path, which is what makes it safe: `capture` is idempotent on `captureId`, so a replay
 * that raced a successful online attempt is a no-op rather than a duplicate.
 *
 * There is no Background Sync. Safari has never shipped it, so the queue is drained by an `online`
 * listener and an on-open pass. That is the whole reason the banner exists: the teacher needs to
 * know work is held locally until the app is open and online again.
 */

const DB_NAME = "edapex-scan-queue";
const DB_VERSION = 1;
const STORE = "captures";

export interface QueuedCapture {
  captureId: string;
  studentId: number;
  examTypeId: number;
  classId: number;
  sectionId: number;
  studentName: string;
  blob: Blob;
  createdAt: number;
}

export type QueueReplayResult =
  | { captureId: string; outcome: "sent" }
  | { captureId: string; outcome: "failed"; message: string };

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "captureId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the capture queue"));
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Capture queue request failed"));
    });
  } finally {
    db.close();
  }
};

/** Stable id so a replay of the same queued capture cannot create a second row. */
export function createQueuedCaptureId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueCapture(capture: QueuedCapture): Promise<void> {
  await withStore("readwrite", (store) => store.put(capture));
}

export async function listQueuedCaptures(): Promise<QueuedCapture[]> {
  const rows = await withStore<QueuedCapture[]>("readonly", (store) => store.getAll());
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeQueuedCapture(captureId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(captureId));
}

export async function countQueuedCaptures(): Promise<number> {
  return withStore<number>("readonly", (store) => store.count());
}

/**
 * Drains the queue. Each item is removed only after a definitive outcome — a network failure keeps
 * it for the next attempt, a rejection from the server removes it (retrying a refused capture
 * would loop forever).
 */
export async function replayQueuedCaptures(): Promise<QueueReplayResult[]> {
  const queue = await listQueuedCaptures();
  const results: QueueReplayResult[] = [];

  for (const item of queue) {
    const form = new FormData();
    form.set("file", new File([item.blob], `${item.captureId}.jpg`, { type: "image/jpeg" }));
    form.set("studentId", String(item.studentId));
    form.set("examTypeId", String(item.examTypeId));
    form.set("classId", String(item.classId));
    form.set("sectionId", String(item.sectionId));
    form.set("captureId", item.captureId);
    form.set("source", "rescan");

    try {
      const captureResponse = await fetch("/api/people/marks/capture", {
        method: "POST",
        body: form,
      });

      if (!captureResponse.ok && captureResponse.status !== 409) {
        // 5xx and network-ish errors keep the item: it may succeed later.
        if (captureResponse.status >= 500) {
          results.push({
            captureId: item.captureId,
            outcome: "failed",
            message: "Server temporarily unavailable; kept for the next attempt",
          });
          continue;
        }
        await removeQueuedCapture(item.captureId);
        results.push({
          captureId: item.captureId,
          outcome: "failed",
          message: "The server rejected this capture",
        });
        continue;
      }

      await fetch("/api/people/marks/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studentId: item.studentId,
          examTypeId: item.examTypeId,
          captureId: item.captureId,
        }),
      }).catch(() => undefined);

      await removeQueuedCapture(item.captureId);
      results.push({ captureId: item.captureId, outcome: "sent" });
    } catch {
      results.push({
        captureId: item.captureId,
        outcome: "failed",
        message: "Still offline; kept for the next attempt",
      });
    }
  }

  return results;
}
