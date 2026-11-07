/**
 * Pure assertions for the local cutover drill.
 *
 * The HTTP and Worker lifecycle live in `drill-http.mjs`; these helpers keep
 * the status/evidence logic testable without starting Wrangler.
 */
export class DrillError extends Error {
  constructor(message) {
    super(message);
    this.name = "DrillError";
  }
}

/**
 * @param {{ status: number, text: string }} response
 * @param {number} expected
 * @param {string} label
 */
export function expectStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new DrillError(
      `${label}: expected ${expected}, got ${response.status}: ${response.text.slice(0, 400)}`
    );
  }
}

/**
 * @param {unknown} value
 * @param {string} message
 * @returns {asserts value}
 */
export function expectTrue(value, message) {
  if (!value) throw new DrillError(message);
}

/**
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function normalizeCategory(name) {
  return String(name ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}

/**
 * @param {Readonly<Record<string, number>>} before
 * @param {Readonly<Record<string, number>>} after
 * @param {ReadonlySet<string>} ignored
 * @returns {{ changed: readonly string[], missing: readonly string[] }}
 */
export function compareCounts(before, after, ignored) {
  const changed = [];
  const missing = [];
  for (const [table, value] of Object.entries(before)) {
    if (ignored.has(table)) continue;
    if (!(table in after)) {
      missing.push(table);
      continue;
    }
    if (after[table] !== value) changed.push(table);
  }
  return { changed, missing };
}

/**
 * @param {Readonly<Record<string, number>>} before
 * @param {Readonly<Record<string, number>>} after
 * @param {ReadonlySet<string>} ignored
 */
export function assertCoreCountsUnchanged(before, after, ignored) {
  const result = compareCounts(before, after, ignored);
  if (result.changed.length > 0 || result.missing.length > 0) {
    throw new DrillError(
      `Core table counts changed: ${[...result.changed, ...result.missing].join(", ")}`
    );
  }
}

/**
 * @param {Readonly<Record<string, number>>} counts
 * @param {readonly string[]} tables
 * @returns {Readonly<Record<string, number>>}
 */
export function pickCounts(counts, tables) {
  const picked = {};
  for (const table of tables) {
    const value = counts[table];
    if (value === undefined) throw new DrillError(`Missing count for ${table}`);
    picked[table] = value;
  }
  return picked;
}
