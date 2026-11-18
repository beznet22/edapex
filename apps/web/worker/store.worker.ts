import {
  openBrowserStoreCore,
  type BrowserStore,
  type WriteRecordInput
} from "../lib/browser-store-core";

/**
 * The sync store's home.
 *
 * `opfs-sahpool` needs `createSyncAccessHandle`, which browsers expose only in a
 * dedicated worker, so the store cannot open on a page thread. This worker owns
 * it and answers one request at a time; the page talks to it through
 * `lib/browser-store.ts`.
 */

export type StoreRequestBody =
  | { readonly type: "open"; readonly masterKey: readonly number[]; readonly filename?: string }
  | { readonly type: "writeRecord"; readonly input: WriteRecordInput }
  | { readonly type: "readRecord"; readonly entityType: string; readonly entityId: string }
  | { readonly type: "pushBatch"; readonly deviceId: string; readonly limit: number }
  | {
      readonly type: "acknowledge";
      readonly deviceId: string;
      readonly workspaceId: string;
      readonly throughSeq: number;
    }
  | { readonly type: "cursor"; readonly deviceId: string; readonly workspaceId: string }
  | { readonly type: "search"; readonly query: string; readonly limit: number }
  | { readonly type: "rebuildSearchIndex" }
  | { readonly type: "close" };

export type StoreRequest = StoreRequestBody & { readonly id: string };

export type StoreResponse =
  | { readonly type: "opened"; readonly id: string; readonly persistent: boolean; readonly version: number }
  | { readonly type: "result"; readonly id: string; readonly value: unknown }
  | { readonly type: "failed"; readonly id: string; readonly code: string; readonly message: string };

const post = (message: StoreResponse): void => {
  (self as unknown as { postMessage(value: StoreResponse): void }).postMessage(message);
};

/** The store's own failures are already typed; keep the code, do not invent one. */
function codeOf(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.startsWith("storage_unavailable")) return "storage_unavailable";
  if (message.includes("master key")) return "invalid_request";
  if (message.startsWith("storage_corrupted")) return "storage_corrupted";
  return "internal";
}

let store: BrowserStore | null = null;

async function handle(request: StoreRequest): Promise<void> {
  if (request.type === "open") {
    if (store === null) {
      store = await openBrowserStoreCore({
        masterKey: Uint8Array.from(request.masterKey),
        ...(request.filename === undefined ? {} : { filename: request.filename })
      });
    }
    post({ type: "opened", id: request.id, persistent: store.persistent, version: store.version });
    return;
  }

  if (store === null) throw new Error("storage_unavailable: the store was not opened");

  switch (request.type) {
    case "writeRecord":
      post({ type: "result", id: request.id, value: store.writeRecord(request.input) });
      return;
    case "readRecord":
      post({
        type: "result",
        id: request.id,
        value: store.readRecord(request.entityType, request.entityId)
      });
      return;
    case "pushBatch":
      post({
        type: "result",
        id: request.id,
        value: store.pushBatch(request.deviceId, request.limit)
      });
      return;
    case "acknowledge":
      store.acknowledge(request.deviceId, request.workspaceId, request.throughSeq);
      post({ type: "result", id: request.id, value: null });
      return;
    case "cursor":
      post({
        type: "result",
        id: request.id,
        value: store.cursor(request.deviceId, request.workspaceId)
      });
      return;
    case "search":
      post({ type: "result", id: request.id, value: store.search(request.query, request.limit) });
      return;
    case "rebuildSearchIndex":
      post({ type: "result", id: request.id, value: store.rebuildSearchIndex() });
      return;
    case "close":
      store.close();
      store = null;
      post({ type: "result", id: request.id, value: null });
      self.close();
      return;
    default: {
      const exhaustive: never = request;
      throw new Error(`storage_unavailable: unknown store request ${JSON.stringify(exhaustive)}`);
    }
  }
}

self.onmessage = (event: MessageEvent<StoreRequest>) => {
  const request = event.data;
  void handle(request).catch((cause: unknown) => {
    post({
      type: "failed",
      id: request.id,
      code: codeOf(cause),
      message: cause instanceof Error ? cause.message : "The local store failed."
    });
  });
};
