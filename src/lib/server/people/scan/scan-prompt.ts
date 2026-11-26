/**
 * Prompt text only — no mapping logic (plan §3). Kept separate so changes to wording never
 * touch the transport or the DB composition.
 *
 * Wording rules learned from the benchmark (§3a):
 * - Name the artefact explicitly. "learner log book" alone made one model answer about a generic
 *   document; naming the printed column headers anchors it to the page.
 * - State the positional contract, because `marks` is re-keyed by index.
 * - Forbid invention. Blank cells must be null, never 0 — a 0 is a plausible-looking wrong mark.
 */
export const EXTRACTION_PROMPT = [
  "You are reading a photographed handwritten learner assessment log book (a school marks sheet).",
  "",
  "Extract exactly what is written on the page. Rules:",
  "1. Read the printed mark columns left to right and return every header in `columnTitles`, in page order.",
  "2. For each subject row, return `marks` with exactly one entry per column, in the same order.",
  "3. A cell that is blank, illegible, or struck through is null. Never substitute 0, and never guess a digit.",
  "4. Copy the student's name and admission number exactly as printed, not as you expect them to read.",
  "5. Values are whole numbers only. Do not return ranges, fractions or totals.",
  "6. Read `daysOpened`, `daysPresent` and `daysAbsent` from the attendance box; null if absent.",
  "7. Return the teacher's handwritten remark in `teacherRemark`; null if there is none.",
  "8. Return trait ratings in `ratings` only if the page has a filled rating box; otherwise [].",
  "9. Set `pageConfidence` to low if any cell required guessing.",
  "",
  "Do not invent subjects, columns, or students that are not on the page.",
].join("\n");

export const EXTRACTION_PROMPT_VERSION = 1;
