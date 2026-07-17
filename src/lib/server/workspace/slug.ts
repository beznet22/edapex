/**
 * Slug generation for workspace paths.
 *
 * Rules:
 *   - Lowercase, drop vowels EXCEPT the first letter of each word, append
 *     trailing digits.
 *     "LOWER BASIC 2" -> "lb2"
 *     "MIDDLE BASIC 1" -> "mb1"
 *     "PRE-NURSERY"    -> "pn"
 *     "NURSERY"        -> "nry"  (or "nursery" — see below)
 *     "DAYCARE"        -> "dcy"
 *   - Single-letter inputs (e.g. "B") stay as-is ("b").
 *   - Empty / null inputs fall back to numeric ID for collision safety.
 *   - NFKD normalization strips diacritics ("PRÉ-NURSERY" -> "prenursery").
 */

function nfkdLower(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function classSlug(className: string | null | undefined, classId: number): string {
  if (!className || className.trim() === "") return String(classId);
  const normalized = nfkdLower(className).replace(/[^a-z0-9\s-]/g, "");
  // Take first letter of each word (splitting on whitespace AND hyphens, and
  // skipping words that are pure digits so the trailing digit is not
  // double-counted). Then append any trailing digits from the original.
  const words = normalized.split(/[\s-]+/).filter(Boolean).filter((w) => !/^\d+$/.test(w));
  const letters = words.map((w) => w[0] ?? "").join("");
  const digits = (normalized.match(/\d+/) ?? [""])[0];
  const slug = letters + digits;
  return slug || String(classId);
}

export function sectionSlug(sectionName: string | null | undefined, sectionId: number): string {
  if (!sectionName || sectionName.trim() === "") return String(sectionId);
  const normalized = nfkdLower(sectionName).replace(/[^a-z0-9]/g, "");
  return normalized || String(sectionId);
}

export function academicYearSlug(yearTitle: string | null | undefined, academicId: number): string {
  if (!yearTitle || yearTitle.trim() === "") return String(academicId);
  return yearTitle.trim();
}

export function sanitizeForFilename(name: string | null | undefined): string {
  if (!name) return "untitled";
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
