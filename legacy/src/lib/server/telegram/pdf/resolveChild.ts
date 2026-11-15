/**
 * Deterministic child-resolution against a parent's authorized child list.
 *
 * Pure: no DB, no async. The caller passes the already-resolved child
 * candidates (from `telegramParentLink.childIds/childNames` joined with
 * `sm_students` admissionNo). The function applies three resolution
 * strategies in order:
 *
 *   1. Exact admission-number match.
 *   2. Exact fullName match (case-insensitive, trimmed).
 *   3. Substring match on fullName (case-insensitive). If exactly one
 *      candidate matches, return it. If multiple, return the ambiguous
 *      set so the caller can render a button keyboard.
 *
 * Anything else returns `not_found`. Empty/whitespace queries also
 * return `not_found` — the dispatcher never calls this for an empty
 * query because the empty-query path renders a button keyboard from
 * the entire `childIds` list.
 */
export interface ChildCandidate {
  studentId: number;
  fullName: string | null;
  admissionNo: number | null;
}

export type ChildResolution =
  | { kind: "exact"; studentId: number; matched: ChildCandidate }
  | { kind: "ambiguous"; matches: ChildCandidate[] }
  | { kind: "not_found" };

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function admissionNoMatches(query: string, candidate: ChildCandidate): boolean {
  if (candidate.admissionNo === null) return false;
  return normalize(query) === normalize(String(candidate.admissionNo));
}

function fullNameExact(query: string, candidate: ChildCandidate): boolean {
  if (candidate.fullName === null) return false;
  return normalize(query) === normalize(candidate.fullName);
}

function fullNameContains(query: string, candidate: ChildCandidate): boolean {
  if (candidate.fullName === null) return false;
  return normalize(candidate.fullName).includes(normalize(query));
}

export function resolveChild(
  query: string,
  candidates: ChildCandidate[],
): ChildResolution {
  const trimmed = query.trim();
  if (trimmed === "" || candidates.length === 0) {
    return { kind: "not_found" };
  }

  // 1. Admission number exact match.
  for (const c of candidates) {
    if (admissionNoMatches(trimmed, c)) {
      return { kind: "exact", studentId: c.studentId, matched: c };
    }
  }

  // 2. Full name exact match.
  for (const c of candidates) {
    if (fullNameExact(trimmed, c)) {
      return { kind: "exact", studentId: c.studentId, matched: c };
    }
  }

  // 3. Substring matches.
  const substringMatches = candidates.filter((c) => fullNameContains(trimmed, c));
  if (substringMatches.length === 1) {
    const only = substringMatches[0];
    if (only) {
      return { kind: "exact", studentId: only.studentId, matched: only };
    }
  }
  if (substringMatches.length > 1) {
    return { kind: "ambiguous", matches: substringMatches };
  }

  return { kind: "not_found" };
}

/**
 * Build the parent's full child list (resolved from the cached
 * `telegramParentLink.childIds/childNames` plus a join to
 * `sm_students.admissionNo`).
 */
export function filterOwned(
  ownedIds: number[],
  candidates: ChildCandidate[],
): ChildCandidate[] {
  const owned = new Set(ownedIds);
  return candidates.filter((c) => owned.has(c.studentId));
}
