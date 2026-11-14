/**
 * Pure helpers for the resumable one-window load.
 *
 * The loader is deliberately file-granular: it never splits a SQL file, so a
 * checkpoint is always a completed file. If the 100k cap is reached, the next
 * run continues after 00:00 UTC the next day.
 */

export const DEFAULT_BUDGET = 95000;
export const HARD_CAP = 100000;

/**
 * @param {string} date
 * @returns {{ date: string, completed: string[], windowWrites: number, totalWrites: number, finished: boolean }}
 */
export function initialState(date) {
  return {
    date,
    completed: [],
    windowWrites: 0,
    totalWrites: 0,
    finished: false
  };
}

/**
 * Normalize a state read from disk for the current UTC date.
 * @param {unknown} value
 * @param {string} date
 * @returns {{ date: string, completed: string[], windowWrites: number, totalWrites: number, finished: boolean }}
 */
export function normalizeState(value, date) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return initialState(date);
  }
  const object = value;
  const completed = Array.isArray(object.completed)
    ? object.completed.filter((entry) => typeof entry === "string")
    : [];
  const windowWrites =
    typeof object.windowWrites === "number" && Number.isFinite(object.windowWrites)
      ? object.windowWrites
      : 0;
  const totalWrites =
    typeof object.totalWrites === "number" && Number.isFinite(object.totalWrites)
      ? object.totalWrites
      : 0;
  const storedDate = typeof object.date === "string" ? object.date : date;
  return {
    date,
    completed,
    windowWrites: storedDate === date ? windowWrites : 0,
    totalWrites,
    finished: object.finished === true
  };
}

/**
 * @param {{ files: readonly { name: string }[] }} plan
 * @param {{ completed: readonly string[], windowWrites: number, finished: boolean }} state
 * @param {number} budget
 * @returns {{ kind: "finished" | "wait" | "run", file?: { name: string }, remaining: number }}
 */
export function nextAction(plan, state, budget = DEFAULT_BUDGET) {
  if (state.finished || state.completed.length === plan.files.length) {
    return { kind: "finished", remaining: 0 };
  }
  if (state.windowWrites >= budget) {
    return { kind: "wait", remaining: 0 };
  }
  const next = plan.files.find((file) => !state.completed.includes(file.name));
  if (next === undefined) return { kind: "finished", remaining: 0 };
  return {
    kind: "run",
    file: next,
    remaining: Math.max(0, budget - state.windowWrites)
  };
}

/**
 * @param {string} stdout
 * @returns {number}
 */
export function parseWrites(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start < 0 || end <= start) {
    throw new Error("No JSON array in wrangler output");
  }
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array from wrangler");
  let total = 0;
  for (const entry of parsed) {
    if (entry === null || typeof entry !== "object") continue;
    const meta = entry.meta;
    if (meta === null || typeof meta !== "object") continue;
    const value = meta.rows_written;
    if (typeof value === "number" && Number.isFinite(value)) total += value;
  }
  return total;
}

/**
 * @param {{ date: string, completed: string[], windowWrites: number, totalWrites: number, finished: boolean }} state
 * @param {string} name
 * @param {number} writes
 * @param {number} fileCount
 * @returns {{ date: string, completed: string[], windowWrites: number, totalWrites: number, finished: boolean }}
 */
export function recordFile(state, name, writes, fileCount) {
  const completed = state.completed.includes(name)
    ? state.completed
    : [...state.completed, name];
  return {
    date: state.date,
    completed,
    windowWrites: state.windowWrites + writes,
    totalWrites: state.totalWrites + writes,
    finished: completed.length >= fileCount
  };
}
