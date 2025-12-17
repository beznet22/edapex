import type { ClassStudent } from "$lib/server/repository/student.repo";

// ---------- Levenshtein Fuzzy Matching ----------
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

// ---------- Normalize helper ----------
function normalize(str: string) {
  return str.toLowerCase().trim();
}

// ---------- Main Search (returns found list) ----------
export function searchFilter(query: string, students: ClassStudent[]) {
  const q = normalize(query);
  if (!q) return [];

  // --- Extract numbers from query (ID or admission number) ---
  const nums = q.match(/\d+/g)?.map(Number) ?? [];
  if (nums.length > 0) {
    for (const num of nums) {
      const byId = students.find((s) => s.id === num);
      if (byId) return [byId];

      const byAdm = students.find((s) => s.admissionNo === num);
      if (byAdm) return [byAdm];
    }
  }

  // --- Tokenize the query ---
  const tokens = q.split(/\s+/).filter(Boolean);

  // --- Score each student ---
  const scored = students.map((s) => {
    const studentName = normalize(s.name || "");
    const studentTokens = studentName.split(" ");

    let score = 0;

    // Direct full-name inside the query
    if (q.includes(studentName)) score += 8;

    // Reverse full-name (alias: "Faith Shima")
    const reversed = studentTokens.slice().reverse().join(" ");
    if (q.includes(reversed)) score += 7;

    // Token-by-token matching
    for (const t of tokens) {
      // Partial anywhere
      if (studentName.includes(t)) score += 3;

      // Partial match against first/last specifically
      if (studentTokens.some((st) => st.includes(t))) score += 4;

      // Initial-based alias ("S. Faith", "Shima F")
      if (t.length === 1 && studentTokens.some((st) => st.startsWith(t))) {
        score += 4;
      }

      // Fuzzy token match (edit distance <= 2)
      for (const st of studentTokens) {
        const dist = levenshtein(st, t);
        if (dist <= 2 && dist / st.length <= 0.4) {
          score += 6; // strong fuzzy hit
        }
      }
    }

    // Full-name fuzzy fallback
    const fullDist = levenshtein(studentName, q);
    if (fullDist <= 4) score += 3;

    return { student: s, score };
  });

  // --- Filter and sort by score ---
  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.student);
}
