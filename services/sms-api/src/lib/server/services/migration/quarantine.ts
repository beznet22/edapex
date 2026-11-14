const COLUMNS = [
  "student_name",
  "admission_no",
  "guardian_name",
  "guardian_phone",
  "class",
  "reason"
] as const;

export interface QuarantineRow {
  readonly studentId: number;
  readonly fullName: string | null;
  readonly admissionNo: number | null;
  readonly guardianName: string | null;
  readonly guardianPhone: string | null;
  readonly className: string | null;
  readonly reason: "NO_CURRENT_RECORD" | "UNPLACED";
}

const escape = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export interface QuarantineGroup {
  readonly className: string;
  readonly rows: readonly QuarantineRow[];
}

export interface QuarantineView {
  readonly sessionId: number;
  readonly total: number;
  readonly groups: readonly QuarantineGroup[];
}

export function groupQuarantine(sessionId: number, rows: readonly QuarantineRow[]): QuarantineView {
  const groups = new Map<string, QuarantineRow[]>();
  for (const row of rows) {
    const key = row.className ?? "NO CLASS";
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [row]);
    else list.push(row);
  }
  return {
    sessionId,
    total: rows.length,
    groups: [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([className, list]) => ({
        className,
        rows: [...list].sort((left, right) =>
          String(left.fullName ?? "").localeCompare(String(right.fullName ?? ""))
        )
      }))
  };
}

export function quarantineCsv(view: QuarantineView): string {
  const lines = [COLUMNS.join(",")];
  for (const group of view.groups) {
    for (const row of group.rows) {
      lines.push(
        [
          row.fullName,
          row.admissionNo,
          row.guardianName,
          row.guardianPhone,
          group.className,
          row.reason
        ]
          .map(escape)
          .join(",")
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Phase 6 precedent: the `.pdf` route returns a JSON render payload. */
export function quarantineDocument(
  view: QuarantineView,
  generatedAt: number
): {
  readonly templateVersion: "quarantine-v1";
  readonly sessionId: number;
  readonly generatedAt: number;
  readonly columns: readonly string[];
  readonly total: number;
  readonly groups: readonly QuarantineGroup[];
} {
  return {
    templateVersion: "quarantine-v1",
    sessionId: view.sessionId,
    generatedAt,
    columns: COLUMNS,
    total: view.total,
    groups: view.groups
  };
}
