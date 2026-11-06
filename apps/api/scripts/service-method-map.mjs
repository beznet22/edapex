/**
 * The 53-row service method map from `02 §5`.
 *
 * Dispositions:
 *   mapped      a unique destination method
 *   merged      a duplicate implementation that collapses into a mapped method
 *   deleted     a thin passthrough; routes call the repository
 *   retired     removed by the target auth model
 *   out_of_scope  app-db notification concern
 */

export const EXPECTED_COUNTS = Object.freeze({
  total: 53,
  mapped: 37,
  merged: 2,
  deleted: 7,
  retired: 5,
  out_of_scope: 2
});

export const SERVICE_METHOD_MAP = [
  // assessment.service.ts — 13 mapped, 7 deleted
  { source: "assessment", method: "publishResults", disposition: "mapped", destination: "assessment/publish.service.ts" },
  { source: "assessment", method: "isEmailAlreadySent", disposition: "mapped", destination: "assessment/publish.service.ts" },
  { source: "assessment", method: "upsertStudentResult", disposition: "mapped", destination: "assessment/entry.service.ts" },
  { source: "assessment", method: "upsertMarksheet", disposition: "mapped", destination: "assessment/entry.service.ts" },
  { source: "assessment", method: "getStudentResult", disposition: "mapped", destination: "assessment/query.service.ts" },
  { source: "assessment", method: "getTranscript", disposition: "mapped", destination: "assessment/query.service.ts" },
  { source: "assessment", method: "getObjectives", disposition: "mapped", destination: "assessment/query.service.ts" },
  { source: "assessment", method: "getMappingData", disposition: "mapped", destination: "assessment/roster-query.service.ts" },
  { source: "assessment", method: "upsertTeacherRemark", disposition: "mapped", destination: "assessment/feedback.service.ts" },
  { source: "assessment", method: "upsertStudentRatings", disposition: "mapped", destination: "assessment/feedback.service.ts" },
  { source: "assessment", method: "upsertAttendance", disposition: "mapped", destination: "attendance/attendance.service.ts" },
  { source: "assessment", method: "doProcessMarks", disposition: "mapped", destination: "domain/marks.ts" },
  { source: "assessment", method: "getClassAverages", disposition: "mapped", destination: "domain/grades.ts" },

  { source: "assessment", method: "assignSubjects", disposition: "deleted", destination: null, reason: "single repository call" },
  { source: "assessment", method: "getClassSections", disposition: "deleted", destination: null, reason: "single repository call" },
  { source: "assessment", method: "getAssignedClassSection", disposition: "deleted", destination: null, reason: "single repository call" },
  { source: "assessment", method: "getStaffByClassSection", disposition: "deleted", destination: null, reason: "single repository call" },
  { source: "assessment", method: "getStudentsByStaffId", disposition: "deleted", destination: null, reason: "single repository call" },
  { source: "assessment", method: "getStudentsByClassSection", disposition: "deleted", destination: null, reason: "single repository call" },
  { source: "assessment", method: "getAssignedSubjects", disposition: "deleted", destination: null, reason: "single repository call" },

  // auth.service.ts — 9 mapped, 5 retired, 2 out of scope
  { source: "auth", method: "login", disposition: "mapped", destination: "auth/auth.service.ts" },
  { source: "auth", method: "getSession", disposition: "mapped", destination: "auth/session.service.ts" },
  { source: "auth", method: "refresh", disposition: "mapped", destination: "auth/session.service.ts" },
  { source: "auth", method: "logout", disposition: "mapped", destination: "auth/session.service.ts" },
  { source: "auth", method: "logoutAll", disposition: "mapped", destination: "auth/session.service.ts" },
  { source: "auth", method: "logoutMobile", disposition: "mapped", destination: "auth/session.service.ts" },
  { source: "auth", method: "refreshMobile", disposition: "mapped", destination: "auth/session.service.ts" },
  { source: "auth", method: "updateProfile", disposition: "mapped", destination: "auth/profile.service.ts" },
  { source: "auth", method: "isAdmin", disposition: "mapped", destination: "authorization/authorization.service.ts" },

  { source: "auth", method: "signup", disposition: "retired", destination: null, reason: "no self-registration in the target model" },
  { source: "auth", method: "changePwd", disposition: "retired", destination: null, reason: "passwordless target" },
  { source: "auth", method: "requestReset", disposition: "retired", destination: null, reason: "replaced by magic link" },
  { source: "auth", method: "resetPwd", disposition: "retired", destination: null, reason: "replaced by magic link" },
  { source: "auth", method: "verifyEmail", disposition: "retired", destination: null, reason: "Google/magic-link verification replaces it" },

  { source: "auth", method: "subscribeToPush", disposition: "out_of_scope", destination: null, reason: "app-db notification concern" },
  { source: "auth", method: "sendPushNotification", disposition: "out_of_scope", destination: null, reason: "app-db notification concern" },

  // settings.service.ts — 11 mapped
  { source: "settings", method: "getGeneralSettings", disposition: "mapped", destination: "settings/general.service.ts" },
  { source: "settings", method: "saveGeneralSettings", disposition: "mapped", destination: "settings/general.service.ts" },
  { source: "settings", method: "getReportSettings", disposition: "mapped", destination: "settings/report.service.ts" },
  { source: "settings", method: "saveReportSettings", disposition: "mapped", destination: "settings/report.service.ts" },
  { source: "settings", method: "listAcademicYears", disposition: "mapped", destination: "settings/academic.service.ts" },
  { source: "settings", method: "getActiveAcademicYear", disposition: "mapped", destination: "settings/academic.service.ts" },
  { source: "settings", method: "createAcademicYear", disposition: "mapped", destination: "settings/academic.service.ts" },
  { source: "settings", method: "setActiveAcademicYear", disposition: "mapped", destination: "settings/academic.service.ts" },
  { source: "settings", method: "listExamTypes", disposition: "mapped", destination: "settings/academic.service.ts" },
  { source: "settings", method: "createExamType", disposition: "mapped", destination: "settings/academic.service.ts" },
  { source: "settings", method: "toggleExamTypeActive", disposition: "mapped", destination: "settings/academic.service.ts" },

  // assessment-publisher.service.ts — 2 unique + 2 duplicate merges
  { source: "assessment-publisher", method: "publishTranscript", disposition: "mapped", destination: "assessment/publish.service.ts" },
  { source: "assessment-publisher", method: "resolveSchoolIdentity", disposition: "mapped", destination: "settings/general.service.ts" },
  { source: "assessment-publisher", method: "publishResults", disposition: "merged", destination: "assessment/publish.service.ts", mergedInto: "assessment/publishResults" },
  { source: "assessment-publisher", method: "isEmailAlreadySent", disposition: "merged", destination: "assessment/publish.service.ts", mergedInto: "assessment/isEmailAlreadySent" },

  // assessment-ocr.service.ts — 2 mapped
  { source: "assessment-ocr", method: "runExtraction", disposition: "mapped", destination: "assessment/ocr.service.ts" },
  {
    source: "assessment-ocr",
    method: "getExtractedAssessment",
    disposition: "mapped",
    destination: "assessment/ocr.service.ts",
    renamedTo: "getCachedExtraction",
    signatureChanged: true
  }
];

const VALID_DISPOSITIONS = new Set(["mapped", "merged", "deleted", "retired", "out_of_scope"]);

export function validateMethodMap(rows) {
  const failures = [];

  if (!Array.isArray(rows)) return ["method map is not an array"];
  if (rows.length !== EXPECTED_COUNTS.total) {
    failures.push(`expected ${EXPECTED_COUNTS.total} rows, found ${rows.length}`);
  }

  const seen = new Set();
  const counts = { mapped: 0, merged: 0, deleted: 0, retired: 0, out_of_scope: 0 };

  for (const [index, row] of rows.entries()) {
    if (typeof row !== "object" || row === null) {
      failures.push(`row ${index} is not an object`);
      continue;
    }
    if (typeof row.source !== "string" || row.source.length === 0) {
      failures.push(`row ${index} has no source`);
    }
    if (typeof row.method !== "string" || row.method.length === 0) {
      failures.push(`row ${index} has no method`);
    }
    const key = `${row.source}#${row.method}`;
    if (seen.has(key)) failures.push(`duplicate row ${key}`);
    seen.add(key);

    if (!VALID_DISPOSITIONS.has(row.disposition)) {
      failures.push(`${key} has invalid disposition '${row.disposition}'`);
      continue;
    }
    counts[row.disposition] += 1;

    const needsDestination = row.disposition === "mapped" || row.disposition === "merged";
    if (needsDestination && (typeof row.destination !== "string" || row.destination.length === 0)) {
      failures.push(`${key} needs a destination`);
    }
    if (!needsDestination && (typeof row.reason !== "string" || row.reason.length === 0)) {
      failures.push(`${key} needs a reason`);
    }
    if (row.disposition === "merged" && typeof row.mergedInto !== "string") {
      failures.push(`${key} needs mergedInto`);
    }
  }

  for (const [disposition, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (disposition === "total") continue;
    if (counts[disposition] !== expected) {
      failures.push(`expected ${expected} ${disposition} rows, found ${counts[disposition]}`);
    }
  }

  const renamed = rows.find(
    (row) => row.source === "assessment-ocr" && row.method === "getExtractedAssessment"
  );
  if (!renamed || renamed.renamedTo !== "getCachedExtraction" || renamed.signatureChanged !== true) {
    failures.push("getExtractedAssessment must record the getCachedExtraction rename");
  }

  return failures;
}
