import type { SessionSyncEvent, SessionSyncEventKind } from "@edapex/contracts";

/**
 * Where a pulled event belongs locally.
 *
 * A `projection` event is transcript: it is safe to render and search. A
 * `core_snapshot` event is the model's own context and belongs in the
 * conversation store — writing it into the transcript, or treating a transcript
 * replay as memory, is the exact confusion the two stores exist to prevent. A
 * `deletion` event is a tombstone, handled by `applyDeletion`.
 *
 * Hosts implement three destinations; this function is what keeps them apart.
 */
export type SessionEventDestination = "transcript" | "model_context" | "deletion";

export function destinationOf(kind: SessionSyncEventKind): SessionEventDestination {
  switch (kind) {
    case "projection":
      return "transcript";
    case "core_snapshot":
      return "model_context";
    case "deletion":
      return "deletion";
  }
}

export interface SplitEvents {
  readonly transcript: readonly SessionSyncEvent[];
  readonly modelContext: readonly SessionSyncEvent[];
  readonly tombstones: readonly SessionSyncEvent[];
}

export function splitEvents(events: readonly SessionSyncEvent[]): SplitEvents {
  const transcript: SessionSyncEvent[] = [];
  const modelContext: SessionSyncEvent[] = [];
  const tombstones: SessionSyncEvent[] = [];
  for (const event of events) {
    switch (destinationOf(event.kind)) {
      case "transcript":
        transcript.push(event);
        break;
      case "model_context":
        modelContext.push(event);
        break;
      case "deletion":
        tombstones.push(event);
        break;
    }
  }
  return { transcript, modelContext, tombstones };
}
