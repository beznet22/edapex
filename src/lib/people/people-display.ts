export type PagerToken = number | "gap";

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  const first = tokens[0][0] ?? "";
  const last = tokens.length > 1 ? (tokens[tokens.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

export function isNonGmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return !normalized.endsWith("@gmail.com");
}

export function formatPercent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function pagerWindow(current: number, totalPages: number): PagerToken[] {
  if (!Number.isFinite(totalPages) || totalPages <= 0) return [];
  const page = Math.min(Math.max(1, Math.trunc(current) || 1), totalPages);
  const candidates = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...candidates]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);

  const tokens: PagerToken[] = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous > 0 && value - previous > 1) tokens.push("gap");
    tokens.push(value);
    previous = value;
  }
  return tokens;
}
