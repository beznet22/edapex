/**
 * `05 §4.3` academic-year additions and `05 §6.1` class ladder metadata.
 *
 * The source year (4) stays writable so the archive job can take it through
 * closing -> archived. Years 1-3 are already historical and are marked archived.
 */
import { asInt, classStage, normalizeName } from "./helpers.mjs";
import { LADDER } from "../tables.mjs";

export function transformAcademicYears(years, options) {
  return years.map((row) => ({
    ...row,
    status:
      asInt(row.id) === options.currentAcademicId
        ? "active"
        : asInt(row.id) < options.currentAcademicId
          ? "archived"
          : "planned",
    archived_at: null,
    archive_manifest_key: null,
    copied_from_id: null,
    active_status: asInt(row.id) === options.currentAcademicId ? 1 : 0
  }));
}

/**
 * Normalises class names, sets the ladder stage/sort order, and leaves
 * `next_class_id` to the bootstrap (it points at next year's rows, which do not
 * exist until session 5 is created).
 */
export function transformClasses(classes, options) {
  const ladderByKey = new Map(
    LADDER.map((entry) => [normalizeName(entry.sourceName).toUpperCase(), entry])
  );
  const resolutions = [];

  const rows = classes.map((row) => {
    const original = String(row.class_name ?? "");
    const normalized = normalizeName(original);
    const key = normalized.toUpperCase();
    const ladder = asInt(row.academic_id) === options.currentAcademicId
      ? ladderByKey.get(key)
      : undefined;
    if (normalized !== original) {
      resolutions.push({
        findingId: "CLASS_NAME",
        entity: "sm_classes",
        entityId: String(row.id),
        beforeJson: JSON.stringify({ class_name: original }),
        afterJson: JSON.stringify({ class_name: normalized }),
        reason: "CLASS_NAME_NORMALISED"
      });
    }
    return {
      ...row,
      class_name: normalized,
      stage: classStage(normalized),
      sort_order: ladder === undefined ? asInt(row.id) : ladder.sortOrder,
      next_class_id: null
    };
  });

  return { rows, resolutions };
}
