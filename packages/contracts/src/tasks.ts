/**
 * Task contracts.
 *
 * `42` forbids a cached task `status`, and the reason is not stylistic: a stored
 * status and the underlying work drift apart, and the person is then shown "done"
 * over a failed run. Every state here is therefore **derived** from rows that
 * already exist, by one pure function, so the list, the badge and the tests cannot
 * disagree about what "blocked" means.
 */

/** What a task can be, in the order the person cares about it. */
export const TASK_STATES = [
  "needs_you",
  "blocked",
  "didnt_work",
  "running",
  "not_completed",
  "done"
] as const;

export type TaskState = (typeof TASK_STATES)[number];

/**
 * Precedence, highest first.
 *
 * A task waiting on a person is never hidden behind a spinner, because the person
 * is the thing the task is waiting for. Encoding the order as data rather than as
 * control flow keeps `deriveTaskState` honest when a new state is added.
 */
export const TASK_STATE_PRECEDENCE: readonly TaskState[] = TASK_STATES;

export interface TaskSignals {
  /** A question is waiting for an answer. */
  readonly openQuestion: boolean;
  /** An approval is pending, or was denied. */
  readonly blockedOnApproval: boolean;
  /** Work ran and failed, with attempts exhausted. */
  readonly failedAfterRetries: boolean;
  /** A run is claimed and unfinished. */
  readonly running: boolean;
  /** A run finished without resolving the task. */
  readonly finishedUnresolved: boolean;
  /** The task was resolved. */
  readonly resolved: boolean;
}

export const NO_SIGNALS: TaskSignals = {
  openQuestion: false,
  blockedOnApproval: false,
  failedAfterRetries: false,
  running: false,
  finishedUnresolved: false,
  resolved: false
};

/**
 * The single derivation.
 *
 * Precedence matters more than exhaustiveness: if two signals are true, the one
 * higher in `TASK_STATE_PRECEDENCE` wins. An unfinished task with no signals is
 * `not_completed` rather than `done`, because silence is not success.
 */
export function deriveTaskState(signals: TaskSignals): TaskState {
  if (signals.openQuestion) return "needs_you";
  if (signals.blockedOnApproval) return "blocked";
  if (signals.failedAfterRetries) return "didnt_work";
  if (signals.running) return "running";
  if (signals.resolved) return "done";
  return "not_completed";
}

/** Whether the person can act on this state. Drives the needs-input badge. */
export function needsPerson(state: TaskState): boolean {
  return state === "needs_you" || state === "blocked";
}

export const TASK_STATE_LABELS: Readonly<Record<TaskState, string>> = {
  needs_you: "Needs you",
  blocked: "Blocked",
  didnt_work: "Didn't work",
  running: "Running",
  not_completed: "Not completed",
  done: "Done"
};

/**
 * Retry display.
 *
 * Shown, never hidden. A silent retry teaches people to distrust the result: if
 * the second attempt succeeds they never learn the first failed, and if it fails
 * they cannot tell whether it tried once or four times.
 */
export interface RetryView {
  readonly attempt: number;
  readonly of: number;
  readonly reason: string | null;
}

export function retryView(input: {
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string | null;
}): RetryView | null {
  if (input.attempts <= 0) return null;
  return {
    attempt: Math.min(input.attempts, input.maxAttempts),
    of: input.maxAttempts,
    // Redacted by the caller; this shape only carries what is displayed.
    reason: input.lastError
  };
}

/** Triage order: what is stopping work now, then what is merely old. */
export function triageRank(state: TaskState, createdAt: number): readonly [number, number] {
  const priority: Readonly<Record<TaskState, number>> = {
    needs_you: 0,
    blocked: 1,
    didnt_work: 2,
    running: 3,
    not_completed: 4,
    done: 5
  };
  // Ascending priority, then oldest first, so a stable sort needs no tie-breaker.
  return [priority[state], createdAt];
}

export function compareTasks(
  a: { readonly state: TaskState; readonly createdAt: number },
  b: { readonly state: TaskState; readonly createdAt: number }
): number {
  const [aRank, aCreated] = triageRank(a.state, a.createdAt);
  const [bRank, bCreated] = triageRank(b.state, b.createdAt);
  return aRank !== bRank ? aRank - bRank : aCreated - bCreated;
}

/** The needs-input count. Same derivation as the list, so the two never disagree. */
export function needsInputCount(states: readonly TaskState[]): number {
  return states.filter(needsPerson).length;
}
