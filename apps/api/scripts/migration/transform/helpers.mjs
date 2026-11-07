/**
 * Pure helpers shared by the migration transforms. No Node built-ins: the
 * Workers vitest pool imports this module directly.
 */

export const MONTHS = Object.freeze({
  JAN: 1,
  FEB: 2,
  MCH: 3,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12
});

export function normalizeName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmail(value) {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length === 0 ? null : email;
}

export function asInt(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

export function asNullableInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

export function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function byId(rows) {
  return new Map(rows.map((row) => [asInt(row.id), row]));
}

export function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const list = groups.get(key);
    if (list === undefined) groups.set(key, [row]);
    else list.push(row);
  }
  return groups;
}

export function maxBy(rows, compare) {
  let winner = null;
  for (const row of rows) {
    if (winner === null || compare(row, winner) > 0) winner = row;
  }
  return winner;
}

export function compareNewest(left, right) {
  const created = asInt(left.created_at) - asInt(right.created_at);
  if (created !== 0) return created;
  return asInt(left.id) - asInt(right.id);
}

export function parentName(row) {
  const guardian = normalizeName(row.guardians_name);
  if (guardian.length > 0) return guardian;
  const father = normalizeName(row.fathers_name);
  const mother = normalizeName(row.mothers_name);
  const combined = [father, mother].filter((part) => part.length > 0).join(" / ");
  return combined.length > 0 ? combined : "Parent";
}

export function parentEmail(row) {
  return normalizeEmail(row.guardians_email);
}

/**
 * Splits a legacy term title into a display name and a `MON/YYYY` suffix.
 * Handles the school's real spellings: doubled spaces, `MCH`, `JULY`,
 * `EXAMINATION -` and the missing space before the hyphen.
 */
export function parseTermTitle(title, id) {
  const text = normalizeName(title);
  const match = /(JAN|FEB|MCH|MAR|APR|MAY|JUN|JULY|JUL|AUG|SEP|OCT|NOV|DEC)\s*\/\s*(\d{4})/i.exec(
    text
  );
  if (match === null) {
    return { id, name: text, suffix: null, month: null, year: null };
  }
  const before = text.slice(0, match.index);
  const cleaned = before.replace(/EXAMINATION/gi, " ").trim();
  const name = normalizeName(cleaned.replace(/[-–—\s]+$/g, ""));
  const monthToken = match[1].toUpperCase() === "JULY" ? "JUL" : match[1].toUpperCase();
  return {
    id,
    name: name.length > 0 ? name : text,
    suffix: `${monthToken}/${match[2]}`,
    month: MONTHS[match[1].toUpperCase()] ?? null,
    year: Number(match[2])
  };
}

export function classStage(name) {
  const normalized = normalizeName(name).toUpperCase();
  if (normalized === "DAYCARE" || normalized === "CRECHE") return "EARLY_YEARS";
  if (normalized.startsWith("NURSERY")) return "EARLY_YEARS";
  if (normalized === "GRADE K") return "EARLY_YEARS";
  if (normalized.startsWith("LOWER BASIC")) return "LOWER_BASIC";
  if (normalized.startsWith("MIDDLE BASIC")) return "MIDDLE_BASIC";
  if (normalized.startsWith("UPPER BASIC")) return "UPPER_BASIC";
  return null;
}

export function canonicalClassKey(name) {
  return normalizeName(name).toUpperCase();
}

export function termDisplayName(name, suffix) {
  return suffix === null ? name : `${name} — ${suffix}`;
}
