/** Crockford base32: no I, L, O or U, so printed slips are unambiguous. */
export const STUDENT_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const STUDENT_CODE_LENGTH = 12;

/**
 * 12 characters × 5 bits = 60 bits (`04a §4`). 256 is a multiple of 32, so
 * `byte % 32` is uniform and needs no rejection sampling.
 */
export function generateStudentCode(): string {
  const bytes = new Uint8Array(STUDENT_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += STUDENT_CODE_ALPHABET.charAt(byte % 32);
  return code;
}

/** Accepts printed or typed forms; Crockford folds I/L to 1 and O to 0. */
export function normaliseCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/[\s-]+/g, "");
  return cleaned.replace(/[IL]/g, "1").replace(/O/g, "0");
}

export function formatStudentCode(code: string): string {
  if (code.length !== STUDENT_CODE_LENGTH) return code;
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}
