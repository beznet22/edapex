/**
 * Pure integrity report model. Keeping the mapping in `schema/` lets both the
 * integrity service and the bootstrap/promotion helpers use it without a
 * service-to-service import.
 */
export interface IntegrityCounts {
  readonly p3: number;
  readonly p4: number;
  readonly f1: number;
  readonly f2: number;
  readonly d1: number;
  readonly d2: number;
  readonly r1: number;
  readonly r2: number;
  readonly r3: number;
  readonly c1: number;
  readonly s1: number;
  readonly termDates: number;
  readonly staffingPending: number;
  readonly staffingReviewed: number;
  readonly unstaffedUnreviewed: number;
  readonly unstaffedTotal: number;
  readonly teachersWithoutClasses: number;
  readonly duplicateCurrentRecords: number;
  readonly targetCurrentRecords: number;
}

export interface IntegrityFindingView {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly blocking: boolean;
  readonly resolved: boolean;
}

export interface IntegrityReadinessView {
  readonly classesWithoutAssignments: number;
  readonly unstaffedTotal: number;
  readonly unreviewedSections: number;
  readonly reviewedSections: number;
  readonly teachersWithoutClasses: number;
  readonly duplicateCurrentRecords: number;
  readonly targetCurrentRecords: number;
}

export interface IntegrityReportView {
  readonly sessionId: number;
  readonly findings: readonly IntegrityFindingView[];
  readonly blockingIdentity: number;
  readonly blockingTarget: number;
  readonly blocking: number;
  readonly gate: "green" | "red";
  readonly readiness: IntegrityReadinessView;
}

const IDENTITY_FINDINGS = [
  ["P3", "Parents with no valid user", "p3"],
  ["P4", "Active users with no profile", "p4"],
  ["F1", "Students with no valid parent", "f1"],
  ["F2", "Parents with no child", "f2"],
  ["D1", "Parent rows sharing one user", "d1"],
  ["R2", "Students with records but no default", "r2"],
  ["R3", "Students with multiple default records", "r3"],
  ["C1", "Student placement disagrees with the default record", "c1"]
] as const;

const TARGET_BLOCKING = new Set(["TERM_DATES", "STAFFING", "ASSIGNMENTS", "STUDENTS_CURRENT"]);

export function buildIntegrityReport(
  sessionId: number,
  counts: IntegrityCounts
): IntegrityReportView {
  const findings: IntegrityFindingView[] = IDENTITY_FINDINGS.map(([id, label, key]) => ({
    id,
    label,
    count: counts[key],
    blocking: id !== "C1",
    resolved: counts[key] === 0
  }));
  findings.push(
    {
      id: "R1",
      label: "Students with no student record",
      count: counts.r1,
      blocking: false,
      resolved: counts.r1 === 0
    },
    {
      id: "D2",
      label: "Shared emails (flag only; /claim returns 409)",
      count: counts.d2,
      blocking: false,
      resolved: counts.d2 === 0
    },
    {
      id: "S1",
      label: "Active assignments with an inactive or missing teacher",
      count: counts.s1,
      blocking: false,
      resolved: counts.s1 === 0
    },
    {
      id: "TERM_DATES",
      label: "Active or planned terms without dates",
      count: counts.termDates,
      blocking: true,
      resolved: counts.termDates === 0
    },
    {
      id: "STAFFING",
      label: "Class-sections pending staffing review",
      count: counts.staffingPending,
      blocking: true,
      resolved: counts.staffingPending === 0
    },
    {
      id: "ASSIGNMENTS",
      label: "Unreviewed class-sections without a subject teacher",
      count: counts.unstaffedUnreviewed,
      blocking: true,
      resolved: counts.unstaffedUnreviewed === 0
    },
    {
      id: "STUDENTS_CURRENT",
      label: "Students with more than one current record in the session",
      count: counts.duplicateCurrentRecords,
      blocking: true,
      resolved: counts.duplicateCurrentRecords === 0
    },
    {
      id: "TEACHERS",
      label: "Active staff without a class assignment",
      count: counts.teachersWithoutClasses,
      blocking: false,
      resolved: counts.teachersWithoutClasses === 0
    }
  );

  const blockingIdentity = findings
    .filter(
      (finding) => finding.blocking && IDENTITY_FINDINGS.some(([id]) => id === finding.id)
    )
    .reduce((sum, finding) => sum + finding.count, 0);
  const blockingTarget = findings
    .filter((finding) => finding.blocking && TARGET_BLOCKING.has(finding.id))
    .reduce((sum, finding) => sum + finding.count, 0);

  return {
    sessionId,
    findings,
    blockingIdentity,
    blockingTarget,
    blocking: blockingIdentity + blockingTarget,
    gate: blockingIdentity + blockingTarget === 0 ? "green" : "red",
    readiness: {
      classesWithoutAssignments: counts.unstaffedUnreviewed,
      unstaffedTotal: counts.unstaffedTotal,
      unreviewedSections: counts.staffingPending,
      reviewedSections: counts.staffingReviewed,
      teachersWithoutClasses: counts.teachersWithoutClasses,
      duplicateCurrentRecords: counts.duplicateCurrentRecords,
      targetCurrentRecords: counts.targetCurrentRecords
    }
  };
}
