/**
 * `05 §3` R1-R4 and C1: one canonical current record per student, canonical
 * academic year, placement backfilled from that record, and the status chain.
 */
import {
  asInt,
  asNullableInt,
  byId,
  compareNewest,
  groupBy,
  maxBy
} from "./helpers.mjs";

function compareRecordPriority(left, right) {
  const year = asInt(left.academic_id) - asInt(right.academic_id);
  if (year !== 0) return year;
  return compareNewest(left, right);
}

function recordStatus(record) {
  if (asInt(record.is_graduate) === 1) return "graduated";
  if (asInt(record.active_status) === 0) return "withdrawn";
  if (asInt(record.is_default) === 1) return "current";
  if (asInt(record.is_promote) === 1) return "promoted";
  return "current";
}

export function transformRecords(students, records, options) {
  const studentById = byId(students);
  const recordsByStudent = groupBy(records, (row) => asNullableInt(row.student_id));
  const resolutions = [];
  const findings = { R1: 0, R2: 0, R3: 0, R4: 0, C1: 0 };
  let backfilled = 0;
  let academicDisagreements = 0;

  for (const record of records) {
    const studentId = asNullableInt(record.student_id);
    if (studentId === null || !studentById.has(studentId)) findings.R4 += 1;
  }

  for (const student of students) {
    const id = asInt(student.id);
    const list = recordsByStudent.get(id) ?? [];
    const defaults = list.filter((row) => asInt(row.is_default) === 1);
    if (list.length === 0) findings.R1 += 1;
    if (defaults.length === 0) findings.R2 += 1;
    if (defaults.length > 1) findings.R3 += 1;
    if (student.class_id !== null && student.class_id !== undefined) findings.C1 += 1;

    const winner = list.length === 0 ? null : maxBy(list, compareRecordPriority);
    const beforeClass = student.class_id;
    const beforeSection = student.section_id;

    for (const record of list) {
      const isWinner = record === winner;
      const wasDefault = asInt(record.is_default) === 1;
      record.is_default = isWinner ? 1 : 0;
      if (wasDefault !== isWinner) {
        resolutions.push({
          findingId: defaults.length > 1 && wasDefault ? "R3" : "R2",
          entity: "student_records",
          entityId: String(record.id),
          beforeJson: JSON.stringify({ is_default: wasDefault ? 1 : 0 }),
          afterJson: JSON.stringify({ is_default: isWinner ? 1 : 0 }),
          reason: isWinner ? "DEFAULT_RECORD_SELECTED" : "DEFAULT_RECORD_CLEARED"
        });
      }

      if (record.academic_id === null || record.academic_id === undefined) {
        record.academic_id = record.session_id ?? student.academic_id ?? null;
      }
      if (
        record.academic_id !== null &&
        record.session_id !== null &&
        record.session_id !== undefined &&
        asInt(record.academic_id) !== asInt(record.session_id)
      ) {
        academicDisagreements += 1;
        resolutions.push({
          findingId: "Y0",
          entity: "student_records",
          entityId: String(record.id),
          beforeJson: JSON.stringify({
            academic_id: record.academic_id,
            session_id: record.session_id
          }),
          afterJson: JSON.stringify({ academic_id: record.academic_id }),
          reason: "ACADEMIC_ID_DISAGREEMENT"
        });
      }
      delete record.session_id;
      record.status = recordStatus(record);
      record.promoted_from_record_id = null;
      record.promotion_batch_id = null;
    }

    if (student.academic_id === null || student.academic_id === undefined) {
      student.academic_id = winner?.academic_id ?? student.session_id ?? null;
    }
    if (
      winner !== null &&
      winner.academic_id !== null &&
      student.academic_id !== null &&
      asInt(winner.academic_id) !== asInt(student.academic_id)
    ) {
      academicDisagreements += 1;
      resolutions.push({
        findingId: "Y0",
        entity: "sm_students",
        entityId: String(student.id),
        beforeJson: JSON.stringify({
          academic_id: student.academic_id,
          record_academic_id: winner.academic_id
        }),
        afterJson: JSON.stringify({ academic_id: student.academic_id }),
        reason: "PLACEMENT_ACADEMIC_DISAGREEMENT"
      });
    }

    delete student.session_id;
    student.current_record_id = winner === null ? null : asInt(winner.id);
    if (winner !== null) {
      const nextClass = winner.class_id ?? student.class_id ?? null;
      const nextSection = winner.section_id ?? student.section_id ?? null;
      student.class_id = nextClass;
      student.section_id = nextSection;
      if (nextClass !== beforeClass || nextSection !== beforeSection) {
        backfilled += 1;
        resolutions.push({
          findingId: "C1",
          entity: "sm_students",
          entityId: String(student.id),
          beforeJson: JSON.stringify({ class_id: beforeClass, section_id: beforeSection }),
          afterJson: JSON.stringify({ class_id: nextClass, section_id: nextSection }),
          reason: "PLACEMENT_BACKFILLED"
        });
      }
    }

    if (winner?.is_graduate !== undefined && asInt(winner.is_graduate) === 1) {
      student.status = "graduated";
    } else if (asInt(student.active_status) === 0) {
      student.status = "withdrawn";
    } else {
      student.status = "active";
    }
  }

  return {
    students,
    records,
    resolutions,
    findings,
    stats: { backfilled, academicDisagreements }
  };
}
