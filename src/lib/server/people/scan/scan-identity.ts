/**
 * Paper-vs-DB identity checking.
 *
 * **Names are the reliable signal, not admission numbers.** Teachers copy the admission number
 * from memory and frequently get it wrong or leave it blank; they do not forget which child's book
 * they are holding. So admission number is treated as weak corroboration only — it can lower
 * confidence when the name is already weak, but it never raises a warning by itself.
 *
 * The scanner is student-locked, so a genuine identity mismatch means the wrong log book was
 * photographed. That must be loud: committing would file one child's marks under another's name.
 * Identity always comes from the DB regardless; this only decides whether the teacher is warned.
 */

export type IdentityLevel = "match" | "uncertain" | "mismatch";

export interface IdentityAssessment {
  level: IdentityLevel;
  /** 0–1. Coverage of the paper's name tokens, weighted by per-token similarity. */
  similarity: number;
  warning: string | null;
  /** True when the paper's admission number disagrees with the DB. Never a warning alone. */
  admissionNoDiffers: boolean;
}

/** Beyond this the names are considered the same person. */
const MATCH_THRESHOLD = 0.82;
/** Below this the paper is treated as a different student. */
const MISMATCH_THRESHOLD = 0.6;
/** A token must reach this to count as "present" in the other name. */
const TOKEN_FLOOR = 0.6;

/**
 * OCR and handwriting routinely swap digits for letters that look alike. Folding them before
 * comparison turns a spurious mismatch into a match without weakening real differences.
 */
const CONFUSABLE: Record<string, string> = {
  "0": "O",
  "1": "I",
  "2": "Z",
  "5": "S",
  "8": "B",
  "6": "G",
  "4": "A",
  "7": "T",
};

export const normaliseNameTokens = (value: string): string[] =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/[0-9]/g, (digit) => CONFUSABLE[digit] ?? digit))
    .filter((token) => token.length > 1);

/** Normalised Levenshtein ratio: 1 = identical, 0 = nothing in common. */
export const tokenSimilarity = (a: string, b: string): number => {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const previous = new Array<number>(b.length + 1);
  const current = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  const distance = previous[b.length];
  return 1 - distance / Math.max(a.length, b.length);
};

/**
 * Scores how much of the paper's name is present in the DB name.
 *
 * Coverage (not symmetric similarity) is the right shape: a teacher writing "AMIRA" for
 * "AMIRA KANYITOR" is a complete match on the name they chose to write, and extra DB tokens
 * (middle names) must not penalise it. Every paper token is matched against its best counterpart
 * in the DB name, so word order and omissions are both tolerated.
 */
export const nameSimilarity = (paperName: string, dbName: string): number => {
  const paperTokens = normaliseNameTokens(paperName);
  const dbTokens = normaliseNameTokens(dbName);
  if (paperTokens.length === 0 || dbTokens.length === 0) return 0;

  let total = 0;
  for (const paperToken of paperTokens) {
    let best = 0;
    for (const dbToken of dbTokens) {
      const score = tokenSimilarity(paperToken, dbToken);
      if (score > best) best = score;
    }
    // Below the floor the tokens are unrelated; counting them would inflate the score.
    total += best >= TOKEN_FLOOR ? best : 0;
  }

  return total / paperTokens.length;
};

export interface IdentityInput {
  paperName: string;
  paperAdmissionNo: number | null;
  dbName: string;
  dbAdmissionNo: number;
}

export function assessIdentity(input: IdentityInput): IdentityAssessment {
  const admissionNoDiffers =
    input.paperAdmissionNo !== null &&
    Number.isFinite(input.paperAdmissionNo) &&
    input.paperAdmissionNo !== input.dbAdmissionNo;

  const similarity = nameSimilarity(input.paperName, input.dbName);
  const hasPaperName = normaliseNameTokens(input.paperName).length > 0;

  if (!hasPaperName) {
    // Nothing readable on the paper. The admission number is the only remaining evidence, and it
    // is the signal teachers get wrong — so this is "uncertain", never a silent pass.
    return {
      level: "uncertain",
      similarity: 0,
      admissionNoDiffers,
      warning:
        "The student name could not be read from the page. Check the image before saving.",
    };
  }

  if (similarity >= MATCH_THRESHOLD) {
    /**
     * One word is not enough evidence to call it a match. A shared surname scores 1.0 on
     * coverage ("KANYITOR" against "AMIRA KANYITOR"), and siblings routinely share surnames, so
     * a single-token paper is capped at "uncertain" — still committable, but the teacher confirms.
     */
    if (normaliseNameTokens(input.paperName).length < 2) {
      return {
        level: "uncertain",
        similarity,
        admissionNoDiffers,
        warning: `Only one name was read from the page ("${input.paperName}") against "${input.dbName}". Check before saving.`,
      };
    }
    return {
      level: "match",
      similarity,
      admissionNoDiffers,
      // A confident name match wins: a wrong admission number is a teacher's typo, not a
      // different child.
      warning: null,
    };
  }

  if (similarity >= MISMATCH_THRESHOLD) {
    return {
      level: "uncertain",
      similarity,
      admissionNoDiffers,
      warning: `The name on the page ("${input.paperName}") only partly matches "${input.dbName}". Check before saving.`,
    };
  }

  return {
    level: "mismatch",
    similarity,
    admissionNoDiffers,
    warning: `The page appears to belong to a different student: it reads "${input.paperName}" but this row is "${input.dbName}". Do not save unless you are sure.`,
  };
}
