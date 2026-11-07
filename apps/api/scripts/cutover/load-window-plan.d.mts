export const DEFAULT_BUDGET: number;
export const HARD_CAP: number;

export interface LoadState {
  readonly date: string;
  readonly completed: readonly string[];
  readonly windowWrites: number;
  readonly totalWrites: number;
  readonly finished: boolean;
}

export interface LoadFile {
  readonly name: string;
  readonly relativePath: string;
  readonly table: string;
  readonly rows: number;
}

export interface LoadPlan {
  readonly files: readonly LoadFile[];
  readonly totals: { readonly liveRows: number; readonly plannedRows: number };
}

export function initialState(date: string): LoadState;
export function normalizeState(value: unknown, date: string): LoadState;
export function nextAction(
  plan: LoadPlan,
  state: LoadState,
  budget?: number
): {
  readonly kind: "finished" | "wait" | "run";
  readonly file?: LoadFile;
  readonly remaining: number;
};
export function parseWrites(stdout: string): number;
export function recordFile(
  state: LoadState,
  name: string,
  writes: number,
  fileCount: number
): LoadState;
