/**
 * `05 §2`: `sm_student_timelines` is operational history. Phase 6's per-student
 * archive object deliberately does not carry it, so Phase 7 exports it as
 * checksummed NDJSON to R2 and excludes the rows from the live load.
 */
import { asInt } from "./helpers.mjs";

export function exportTimelines(rows) {
  const bySession = new Map();
  for (const row of rows) {
    const academicId = asInt(row.academic_id);
    const list = bySession.get(academicId);
    if (list === undefined) bySession.set(academicId, [row]);
    else list.push(row);
  }

  const exports = [];
  for (const [academicId, list] of [...bySession.entries()].sort((a, b) => a[0] - b[0])) {
    const ndjson = list
      .slice()
      .sort((left, right) => asInt(left.id) - asInt(right.id))
      .map((row) => JSON.stringify(row))
      .join("\n");
    exports.push({
      academicId,
      rows: list.length,
      ndjson: ndjson.length === 0 ? "" : `${ndjson}\n`,
      key: `migration/timelines/session-${academicId}.ndjson`
    });
  }
  return { bySession, exports };
}
