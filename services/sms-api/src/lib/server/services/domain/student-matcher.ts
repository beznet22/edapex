import type { AssessmentCategory } from "../../../constants/assessment";

export interface RosterCandidate {
  readonly id: number;
  readonly name: string;
  readonly admissionNo: number | null;
}

export interface MatchEvidence {
  readonly fullName: string;
  readonly admissionNo: string | null;
  readonly classLabel: string | null;
  readonly category: AssessmentCategory | null;
}

export interface MatchContext {
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly category: AssessmentCategory | null;
}

export interface ScoredCandidate {
  readonly studentId: number;
  readonly name: string;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface StudentMatch {
  readonly status: "suggested" | "ambiguous" | "unbound";
  readonly studentId: number | null;
  readonly method: "name" | "admission_no" | null;
  readonly score: number;
  readonly candidates: readonly ScoredCandidate[];
  readonly warnings: readonly string[];
}

const normalizeTokens = (value: string): readonly string[] =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);

const normalizeAdmission = (value: string | null): string | null => {
  if (value === null) return null;
  const digits = value.replace(/\D/g, "").replace(/^0+/, "");
  return digits.length === 0 ? null : digits;
};

const normalizeLabel = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const up = previous[column] ?? 0;
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      previous[column] = Math.min(up + 1, (previous[column - 1] ?? 0) + 1, diagonal + cost);
      diagonal = up;
    }
  }
  return previous[right.length] ?? 0;
}

const similarity = (left: string, right: string): number => {
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : 1 - levenshtein(left, right) / longest;
};

function scoreName(ocrTokens: readonly string[], rosterTokens: readonly string[]): number {
  if (ocrTokens.length === 0 || rosterTokens.length === 0) return 0;
  const ocrKey = ocrTokens.join(" ");
  const rosterKey = rosterTokens.join(" ");
  if (ocrKey === rosterKey) return 1;

  const ocrSet = new Set(ocrTokens);
  const rosterSet = new Set(rosterTokens);
  const ocrInRoster = ocrTokens.every((token) => rosterSet.has(token));
  const rosterInOcr = rosterTokens.every((token) => ocrSet.has(token));
  if (ocrInRoster && rosterInOcr) return 0.95;
  if (ocrInRoster || rosterInOcr) return 0.8;

  const score = similarity(ocrKey, rosterKey);
  return score >= 0.85 ? 0.65 + (score - 0.85) : 0;
}

/** Pure roster matcher. It can suggest, never confirm, a student. */
export function matchStudent(
  evidence: MatchEvidence,
  roster: readonly RosterCandidate[],
  context: MatchContext
): StudentMatch {
  const warnings: string[] = [];
  const ocrTokens = normalizeTokens(evidence.fullName);
  const ocrAdmission = normalizeAdmission(evidence.admissionNo);

  const ocrLabel = evidence.classLabel === null ? "" : normalizeLabel(evidence.classLabel);
  const contextLabel =
    context.className === null || context.sectionName === null
      ? ""
      : normalizeLabel(`${context.className}${context.sectionName}`);
  if (
    ocrLabel.length > 0 &&
    contextLabel.length > 0 &&
    ocrLabel !== contextLabel
  ) {
    warnings.push("class_label_mismatch");
  }
  if (
    evidence.category !== null &&
    context.category !== null &&
    evidence.category !== context.category
  ) {
    warnings.push("category_mismatch");
  }

  const scored = roster.map((candidate) => {
    const nameScore = scoreName(ocrTokens, normalizeTokens(candidate.name));
    const rosterAdmission =
      candidate.admissionNo === null ? null : String(candidate.admissionNo);
    const admissionMatched =
      ocrAdmission !== null &&
      rosterAdmission !== null &&
      normalizeAdmission(rosterAdmission) === ocrAdmission;
    const admissionMismatch =
      ocrAdmission !== null &&
      rosterAdmission !== null &&
      normalizeAdmission(rosterAdmission) !== ocrAdmission;

    let score = nameScore;
    if (admissionMatched) score = Math.min(1, score + 0.15);
    if (admissionMismatch) score = Math.max(0, score - 0.3);

    const reasons: string[] = [];
    if (nameScore >= 0.95) reasons.push("name_exact");
    else if (nameScore > 0) reasons.push("name_partial");
    if (admissionMatched) reasons.push("admission_match");
    if (admissionMismatch) reasons.push("admission_mismatch");

    return { studentId: candidate.id, name: candidate.name, score, reasons };
  });

  const candidates = scored
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  const top = candidates[0];
  if (top === undefined || top.score < 0.5) {
    return { status: "unbound", studentId: null, method: null, score: 0, candidates, warnings };
  }

  const second = candidates[1];
  const unique = top.score >= 0.85 && (second === undefined || top.score - second.score >= 0.15);
  if (!unique) {
    if (second !== undefined && Math.abs(top.score - second.score) < 0.001) {
      warnings.push("duplicate_name");
    }
    return {
      status: "ambiguous",
      studentId: null,
      method: null,
      score: top.score,
      candidates,
      warnings
    };
  }

  const method = top.reasons.includes("admission_match") ? "admission_no" : "name";
  return {
    status: "suggested",
    studentId: top.studentId,
    method,
    score: top.score,
    candidates,
    warnings
  };
}
