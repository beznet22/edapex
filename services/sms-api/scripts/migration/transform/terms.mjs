/**
 * `05 §4.1`: `sm_exam_types` becomes the term model.
 *
 * - id is preserved (exam setups, marks, results and attendance reference it)
 * - the title splits into `name` + `legacy_suffix` (`DEC/2025`)
 * - sequence is assigned by suffix date within each academic year
 * - historical terms are closed and keep NULL dates; `TERM_DATES_UNKNOWN` records
 *   the missing calendar rather than inventing one
 * - a duplicate name within one academic year is renamed, never deleted, so the
 *   119k mark rows keep their FK target
 */
import { asInt, maxBy, normalizeName, parseTermTitle } from "./helpers.mjs";

function termPriority(row) {
  const year = row.parsed.year ?? 9999;
  const month = row.parsed.month ?? 12;
  return year * 100 + month;
}

function compareTerm(left, right) {
  const priority = termPriority(left) - termPriority(right);
  if (priority !== 0) return priority;
  return asInt(left.row.id) - asInt(right.row.id);
}

function compareCanonical(left, right) {
  const leftYear = Number(String(left.legacy_suffix ?? "").split("/")[1] ?? 0);
  const rightYear = Number(String(right.legacy_suffix ?? "").split("/")[1] ?? 0);
  if (leftYear !== rightYear) return leftYear - rightYear;
  const created = asInt(left.created_at) - asInt(right.created_at);
  if (created !== 0) return created;
  return asInt(left.id) - asInt(right.id);
}

export function transformTerms(rows) {
  const resolutions = [];
  const byYear = new Map();
  for (const row of rows) {
    const academicId = asInt(row.academic_id);
    const parsed = parseTermTitle(row.title, row.id);
    const entry = { row, parsed };
    const list = byYear.get(academicId);
    if (list === undefined) byYear.set(academicId, [entry]);
    else list.push(entry);
  }

  const transformed = [];
  for (const [academicId, entries] of byYear) {
    const ordered = [...entries].sort(compareTerm);
    let sequence = 0;
    for (const entry of ordered) {
      sequence += 1;
      const name = normalizeName(entry.parsed.name);
      const suffix = entry.parsed.suffix;
      transformed.push({
        id: entry.row.id,
        active_status: asInt(entry.row.active_status, 1),
        name,
        school_id: asInt(entry.row.school_id, 1),
        academic_id: academicId,
        parent_id: asInt(entry.row.parent_id, 0),
        sequence,
        starts_on: null,
        ends_on: null,
        status: "closed",
        grading: JSON.stringify({
          isAverage: entry.row.is_average,
          percentage: entry.row.percentage,
          averageMark: entry.row.average_mark,
          percantage: entry.row.percantage
        }),
        legacy_suffix: suffix,
        created_at: entry.row.created_at,
        updated_at: entry.row.updated_at,
        created_by: entry.row.created_by,
        updated_by: entry.row.updated_by
      });
      resolutions.push({
        findingId: "TERM",
        entity: "sm_exam_types",
        entityId: String(entry.row.id),
        beforeJson: JSON.stringify({ title: entry.row.title }),
        afterJson: JSON.stringify({ name, sequence, legacy_suffix: suffix }),
        reason: "TERM_TITLE_SPLIT"
      });
      if (suffix === null) {
        resolutions.push({
          findingId: "TERM",
          entity: "sm_exam_types",
          entityId: String(entry.row.id),
          beforeJson: null,
          afterJson: JSON.stringify({ sequence }),
          reason: "TERM_SEQUENCE_INFERRED"
        });
      }
      resolutions.push({
        findingId: "TERM",
        entity: "sm_exam_types",
        entityId: String(entry.row.id),
        beforeJson: null,
        afterJson: JSON.stringify({ starts_on: null, ends_on: null }),
        reason: "TERM_DATES_UNKNOWN"
      });
    }
  }

  // A duplicate name in one academic year would violate
  // unique(academic_id, name). Keep the newest row canonical and rename the
  // older one; nothing is deleted and no mark FK is re-pointed.
  const byYearName = new Map();
  for (const term of transformed) {
    const key = `${term.academic_id}:${term.name.toUpperCase()}`;
    const list = byYearName.get(key);
    if (list === undefined) byYearName.set(key, [term]);
    else list.push(term);
  }
  for (const group of byYearName.values()) {
    if (group.length < 2) continue;
    const canonical = maxBy(group, compareCanonical);
    for (const term of group) {
      if (term === canonical) continue;
      const oldName = term.name;
      term.name = normalizeName(
        `${oldName} (LEGACY ${term.legacy_suffix ?? term.id})`
      );
      resolutions.push({
        findingId: "TERM",
        entity: "sm_exam_types",
        entityId: String(term.id),
        beforeJson: JSON.stringify({ name: oldName }),
        afterJson: JSON.stringify({ name: term.name, canonical_id: canonical.id }),
        reason: "TERM_DUPLICATE"
      });
    }
  }

  return { rows: transformed, resolutions };
}
