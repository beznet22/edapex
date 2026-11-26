export type ScannerSubject = {
  subjectId: number;
  subjectCode: string | null;
  subjectName: string | null;
};

export type SubjectMatch = {
  subjectId: number | null;
  subjectCode: string;
  subjectName: string | null;
  warning: string | null;
};

export const normaliseSubjectCode = (code: string): string =>
  code
    .toUpperCase()
    .replace(/[^A-Z0-9/]/g, "")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .sort()
    .join("/");

/**
 * Assignment-scoped matching against the class's own subject list.
 *
 * **Exact normalised match only — no contains/substring fallback.** Live data made the fallback
 * actively harmful: classes 15/5, 15/6 and 15/7 are assigned both `CL/VR` and `JP/LIT`, and
 * `PSRN` and `PSRN/QR` both exist as codes. A contains-match on those goes ambiguous and blocks
 * commit, while never rescuing a real paper — every assigned code in the active year is printed
 * on the paper verbatim (`MATH ENG CCA CRS BASIC SCIENCE ICT PHE CIVIC` for the LOWERBASIC
 * classes, `BIBLE CLL/JP KUW/EAD PSED/PD PSRN` for CRECHE). So a fuzzy layer can only convert a
 * clean exact match into an ambiguity. Unmatched codes surface as a blocking error instead.
 */
export function matchSubjectCode(
  extractedCode: string,
  candidates: ScannerSubject[]
): SubjectMatch {
  const target = normaliseSubjectCode(extractedCode);
  const usable = candidates.filter((candidate) => candidate.subjectCode);

  const exact = usable.filter((candidate) => normaliseSubjectCode(candidate.subjectCode!) === target);
  if (exact.length === 1) {
    const [hit] = exact;
    return {
      subjectId: hit.subjectId,
      subjectCode: hit.subjectCode ?? extractedCode,
      subjectName: hit.subjectName,
      warning: null,
    };
  }
  if (exact.length > 1) {
    return {
      subjectId: null,
      subjectCode: extractedCode,
      subjectName: null,
      warning: `Subject "${extractedCode}" is ambiguous: ${exact.length} assignments match`,
    };
  }

  return {
    subjectId: null,
    subjectCode: extractedCode,
    subjectName: null,
    warning: `Subject "${extractedCode}" is not assigned to this class`,
  };
}

/** Mirrors `AssessmentService.getGrade` without needing the service instance. */
