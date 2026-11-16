import type { WorkspaceRuntimeState } from "@edapex/chat";

/**
 * Waiting for a turn to settle.
 *
 * Split from the adapter because it is the one part of the runtime a *scheduler* depends
 * on rather than a person, and the rules are subtle enough to deserve their own file:
 *
 * - `waiting_for_person` is **not** a failure. A routine that needs an approval did
 *   exactly what it should; recording it as failed would mark a task broken because it
 *   asked a question.
 * - A turn can be queued behind a busy runtime, so the first state change may still be
 *   idle. Resolving then reports success before anything ran — hence `sawBusy`.
 * - On timeout it reports failure, because "we do not know" must not read as success.
 */
export interface Settlement {
  readonly status: "succeeded" | "waiting" | "failed";
  readonly error?: string;
}

export interface SettleSource {
  readonly state: WorkspaceRuntimeState;
  subscribe: (listener: () => void) => () => void;
  send: (text: string) => void;
}

const busy = (state: WorkspaceRuntimeState): boolean =>
  state.turn.state === "thinking" ||
  state.turn.state === "following" ||
  state.turn.state === "tool_running" ||
  state.turn.state === "waiting_for_person";

export async function waitForSettlement(
  source: SettleSource,
  text: string,
  timeoutMs: number
): Promise<Settlement> {
  return await new Promise<Settlement>((resolve) => {
    let settled = false;
    let sawBusy = false;

    const finish = (result: Settlement): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    };

    const unsubscribe = source.subscribe(() => {
      const state = source.state.turn.state;
      if (busy(source.state)) sawBusy = true;
      if (!sawBusy) return;

      if (state === "waiting_for_person") {
        finish({ status: "waiting" });
        return;
      }
      if (state === "error" || state === "stopped") {
        finish({ status: "failed", error: `the turn ended as ${state}` });
        return;
      }
      if (!busy(source.state)) finish({ status: "succeeded" });
    });

    const timer = setTimeout(
      () => finish({ status: "failed", error: "the turn timed out" }),
      timeoutMs
    );

    source.send(text);
  });
}
