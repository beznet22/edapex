import type { Marksheet, Category } from "$lib/schema/marksheet";
import { EXAM_MARK_MAXIMUMS } from "$lib/constants/assessment";

const MENTION_SPAN_RE = /<span\s+([^>]*data-type="mention"[^>]*)>@([^<]+)<\/span>/g;

const FIELD_NAME_MAP: Record<string, string> = {
  "full name": "fullName",
  "admission no": "adminNo",
  "class": "className",
  "section": "sectionName",
  "academic year": "sessionYear",
  "days open": "daysOpened",
  "days present": "daysPresent",
  "days absent": "daysAbsent",
  "parent email": "parentEmail",
  "parent name": "parentName",
};

const CATEGORY_MAP: Record<string, Category> = {
  creche: "DAYCARE",
  daycare: "DAYCARE",
  nursery: "NURSERY",
  gradek: "GRADEK",
  lowerbasic: "LOWERBASIC",
  middlebasic: "MIDDLEBASIC",
};

function parseMentions(md: string): {
  studentId: number | null;
  examTypeId: number | null;
  academicId: number | null;
  admissionNo: number | null;
  studentName: string | null;
} {
  let match: RegExpExecArray | null;
  const result = { studentId: null, examTypeId: null, academicId: null, admissionNo: null, studentName: null } as Record<string, number | string | null>;
  while ((match = MENTION_SPAN_RE.exec(md)) !== null) {
    const attrs = match[1];
    const category = /data-category="([^"]+)"/.exec(attrs)?.[1];
    const id = /data-id="([^"]+)"/.exec(attrs)?.[1];
    const admNo = /data-admission-no="([^"]+)"/.exec(attrs)?.[1];
    const sName = /data-student-name="([^"]+)"/.exec(attrs)?.[1];
    if (category === "students") {
      if (id) result.studentId = Number(id);
      if (admNo) result.admissionNo = Number(admNo);
      if (sName) result.studentName = sName;
    } else if (category === "exam") {
      if (id) result.examTypeId = Number(id);
    } else if (category === "academic_year") {
      if (id) result.academicId = Number(id);
    }
  }
  return result as { studentId: number | null; examTypeId: number | null; academicId: number | null; admissionNo: number | null; studentName: string | null };
}

function parseSchoolInfo(md: string): Marksheet["school"] {
  const section = extractSection(md, "## School Information");
  if (!section) {
    return { id: 0, name: "", email: "", phone: "", city: "", state: "", title: "", vacation_date: "" };
  }

  const map: Record<string, string> = {};
  const lineRe = /-\s+\*\*([^*]+)\*\*\s*(.+)/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(section)) !== null) {
    const key = m[1].trim().replace(/:$/, "").toLowerCase().replace(/\s+/g, "_");
    const val = m[2].trim();
    map[key] = val;
  }

  return {
    id: Number(map["id"] ?? 0),
    name: map["name"] ?? "",
    email: map["email"] ?? "",
    phone: map["phone"] ?? "",
    city: map["city"] ?? "",
    state: map["state"] ?? "",
    title: map["title"] ?? "",
    vacation_date: map["vacation_date"] ?? "",
  };
}

function extractSection(md: string, heading: string): string | null {
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)${esc}\\s*\\n([\\s\\S]*?)(?=\\n## |\\n# |$)`, "");
  const m = re.exec(md);
  return m ? m[1].trim() : null;
}

function stripHtml(val: string): string {
  return val.replace(/<[^>]*>/g, "").replace(/^@/, "").trim();
}

function parseStudentInfo(md: string, mentions: ReturnType<typeof parseMentions>): Marksheet["student"] & { categoryRaw?: string } {
  const section = extractSection(md, "## Student Information");
  if (!section) {
    return { id: 0, examTypeId: 0, fullName: "", gender: "", parentEmail: "", parentName: "", term: "", title: "", category: "DAYCARE", className: "", sectionName: "", adminNo: 0, sessionYear: "", daysOpened: 0, daysAbsent: 0, daysPresent: 0, token: "" };
  }

  const kv: Record<string, string> = {};
  const tableRe = /\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g;
  let t: RegExpExecArray | null;
  while ((t = tableRe.exec(section)) !== null) {
    const key = t[1].trim().toLowerCase();
    const val = t[2].trim();
    if (key === "field" && val === "details") continue;
    kv[key] = val;
  }
  const lineRe = /-\s+\*\*([^*]+)\*\*\s*(.+)/g;
  let l: RegExpExecArray | null;
  while ((l = lineRe.exec(section)) !== null) {
    const key = l[1].trim().toLowerCase();
    const val = l[2].trim();
    kv[key] = val;
  }

  function read(field: string): string {
    const raw = kv[field] ?? kv[field.replace(/ /g, "")] ?? "";
    return stripHtml(raw);
  }
  function readNum(field: string): number {
    return Number(read(field)) || 0;
  }

  const parsedCategory = CATEGORY_MAP[read("category").toLowerCase().replace(/[\s-]/g, "")] ?? "DAYCARE";

  const titleLine = extractTitleLine(md);
  const { title: examTitle, fullName: parsedName } = titleLine;

  const h1Match = /^#\s+(.+?)(?:\s*$)/m.exec(md);
  const h1Title = h1Match ? h1Match[1].trim() : "";

  return {
    id: mentions.studentId ?? 0,
    examTypeId: mentions.examTypeId ?? 0,
    fullName: read("full name") || parsedName || mentions.studentName || "",
    gender: read("gender"),
    parentEmail: read("parent email"),
    parentName: read("parent name"),
    term: read("term"),
    title: h1Title || examTitle || "",
    category: parsedCategory,
    className: read("class"),
    sectionName: read("section"),
    adminNo: readNum("admission no"),
    sessionYear: read("session year") || read("academic year"),
    daysOpened: readNum("days open"),
    daysAbsent: readNum("days absent"),
    daysPresent: readNum("days present"),
    token: `token-${readNum("admission no") || 0}`,
  };
}

function extractTitleLine(md: string): { fullName: string; title: string } {
  const m = /^#\s+(.+?)\s*—\s*(.+?)\s*$/m.exec(md);
  if (m) {
    return { fullName: m[1].trim(), title: m[2].trim() };
  }
  return { fullName: "", title: "" };
}

function extractSubjectsAndRecords(md: string, studentId: number, category: Category): { subjects: Marksheet["subjects"]; records: Marksheet["records"] } {
  const section = extractSection(md, "## Academic Performance");
  if (!section) return { subjects: [], records: [] };

  const table = extractTable(section);
  if (!table || table.rows.length < 1) return { subjects: [], records: [] };

  const headerCells = table.headers;
  if (headerCells.length < 2) return { subjects: [], records: [] };

  const titles: string[] = [];
  const fullMarks: number[] = [];
  let loCol = -1;

  for (let i = 1; i < headerCells.length; i++) {
    const h = headerCells[i].trim();
    const loMatch = h.match(/^learning\s*outcome$/i);
    if (loMatch) {
      loCol = i;
      continue;
    }
    const m = h.match(/^(.+?)\s*\((\d+)\)\s*$/);
    if (m) {
      titles.push(m[1].trim());
      fullMarks.push(Number(m[2]));
    } else {
      titles.push(h);
      fullMarks.push(0);
    }
  }

  const subjects: Marksheet["subjects"] = [];
  const records: Marksheet["records"] = [];
  const nTitles = titles.length;

  for (const row of table.rows) {
    if (row.length < 2) continue;
    const subjectCode = row[0].trim();
    if (!subjectCode || subjectCode.startsWith("**")) continue;

    const marks: number[] = [];
    for (let i = 1; i < row.length && i - 1 < nTitles; i++) {
      marks.push(Number(row[i].trim()) || 0);
    }
    const totalScore = marks.reduce((s, v) => s + v, 0);

    let learningOutcome: string | null = null;
    if (loCol > 0 && loCol < row.length) {
      const raw = row[loCol].trim();
      if (raw) learningOutcome = raw;
    }

    subjects.push({ subjectId: null, subjectCode, teacherId: null });
    records.push({
      studentId,
      resultId: 0,
      subjectId: 0,
      subject: subjectCode,
      subjectCode,
      objectives: null,
      titleIds: [],
      titles,
      markIds: [],
      marks,
      fullMarks,
      totalScore,
      grade: "",
      category,
      learningOutcome,
    });
  }

  return { subjects, records };
}

interface SimpleTable {
  headers: string[];
  rows: string[][];
}

function extractTable(md: string): SimpleTable | null {
  const lines = md.split("\n").filter(l => l.trim().startsWith("|"));
  if (lines.length < 2) return null;

  const rows: string[][] = [];
  let isHeaderSep = false;

  for (const line of lines) {
    const cells = line.split("|").slice(1, -1).map(c => c.trim());
    if (cells.every(c => /^:?-+:?$/.test(c.replace(/\*/g, "").trim()))) {
      isHeaderSep = true;
      continue;
    }
    rows.push(cells);
  }

  if (rows.length === 0) return null;

  const headerCells = rows[0];
  const dataRows = isHeaderSep ? rows.slice(1) : rows.slice(1);

  return {
    headers: headerCells,
    rows: dataRows,
  };
}

function parseRatings(md: string): Marksheet["ratings"] {
  const section = extractSection(md, "## Learner's Rating");
  if (!section) return [];

  const table = extractTable(section);
  if (!table) return [];

  return table.rows.map(row => {
    const attr = row[0]?.trim() ?? "";
    const rateStr = row[1]?.trim() ?? "";
    return {
      attribute: attr,
      rate: Number(rateStr) || null,
      remark: null,
      color: null,
    };
  });
}

function parseRemark(md: string): { remark: string | null } {
  const section = extractSection(md, "## Teacher's Remark");
  if (!section) return { remark: null };

  const blockquoteRe = />\s*(.+)/g;
  const lines: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockquoteRe.exec(section)) !== null) {
    lines.push(m[1].trim());
  }
  const remark = lines.join("\n");
  return { remark: remark || null };
}

function extractExamType(md: string, mentions: ReturnType<typeof parseMentions>): Marksheet["examType"] | undefined {
  const section = extractSection(md, "## Student Information");
  let termName = "";
  if (section) {
    const termRe = /\|\s*Term\s*\|\s*(.+?)\s*\|/i;
    const t = termRe.exec(section);
    if (t) {
      termName = t[1].replace(/<[^>]*>/g, "").replace(/^@/, "").trim();
    }
  }

  if (!mentions.examTypeId && !termName) return undefined;
  return {
    id: mentions.examTypeId ?? 0,
    title: termName || undefined,
  };
}

function computeScore(records: Marksheet["records"]): Marksheet["score"] {
  if (records.length === 0) {
    return { total: 0, average: 0, classAverage: { min: { value: "0" }, max: { value: "0" } }, maxScores: 0 };
  }
  const totals = records.map(r => r.totalScore);
  const total = totals.reduce((s, v) => s + v, 0);
  const average = total / records.length;
  const maxScores = records.length * 100;
  return {
    total: Math.round(total * 100) / 100,
    average: Math.round(average * 100) / 100,
    classAverage: {
      min: { value: String(Math.min(...totals)) },
      max: { value: String(Math.max(...totals)) },
    },
    maxScores,
  };
}

export function parseMarksheetMarkdown(markdown: string): Marksheet {
  const mentions = parseMentions(markdown);

  const school = parseSchoolInfo(markdown);

  const studentPartial = parseStudentInfo(markdown, mentions);

  const { subjects, records } = extractSubjectsAndRecords(markdown, studentPartial.id, studentPartial.category);

  const ratings = parseRatings(markdown);

  const remark = parseRemark(markdown);

  const examType = extractExamType(markdown, mentions);

  const score = computeScore(records);

  return {
    school,
    student: studentPartial,
    subjects,
    records,
    score,
    ratings,
    remark,
    examType,
    recordId: null,
  };
}

// ─── Auto-fix types ──────────────────────────────────────────────────────────

export type DiagnosticCode =
  | "H1_MISSING"
  | "H1_MALFORMED"
  | "SCHOOL_SECTION_MISSING"
  | "SCHOOL_BULLET_FORMAT_WRONG"
  | "SCHOOL_BULLETS_FLATTENED"
  | "STUDENT_SECTION_MISSING"
  | "STUDENT_TABLE_MALFORMED"
  | "STUDENT_FIELD_ROW_MISSING"
  | "ACADEMIC_SECTION_MISSING"
  | "ACADEMIC_TABLE_MISSING"
  | "ACADEMIC_FIRST_COLUMN_WRONG"
  | "ACADEMIC_LO_COLUMN_REQUIRED"
  | "ACADEMIC_LO_COLUMN_UNEXPECTED"
  | "ACADEMIC_HEADER_MISSING_MAX"
  | "ACADEMIC_NO_DATA_ROWS"
  | "ACADEMIC_MULTIPLE_TABLES"
  | "RATINGS_SECTION_MISSING"
  | "RATINGS_TABLE_MALFORMED"
  | "REMARK_SECTION_MISSING"
  | "REMARK_BLOCKQUOTE_MISSING"
  | "SECTION_OUT_OF_ORDER"
  | "DUPLICATE_SECTION"
  | "EXTRA_SECTION";

export type SectionKind = "h1" | "school" | "student" | "academic" | "ratings" | "remark";

export interface DocBlock {
  type: "h1" | "section";
  heading: string | null;
  body: string;
  startLine: number;
  endLine: number;
}

export interface StructureDiagnostic {
  code: DiagnosticCode;
  severity: "error" | "warning";
  section: SectionKind;
  message: string;
}

export interface FixRecord {
  section: SectionKind;
  code: DiagnosticCode;
  description: string;
}

export interface AutoFixResult {
  fixedMd: string;
  fixes: FixRecord[];
  unresolved: StructureDiagnostic[];
  parsed: Marksheet | null;
}

const CANONICAL_HEADINGS: Record<string, SectionKind> = {
  "## School Information": "school",
  "## Student Information": "student",
  "## Academic Performance": "academic",
  "## Learner's Rating": "ratings",
  "## Teacher's Remark": "remark",
};

const CANONICAL_ORDER: SectionKind[] = ["school", "student", "academic", "ratings", "remark"];

const REQUIRED_STUDENT_ROWS = new Set([
  "full name", "admission no", "class", "section", "category", "term",
]);

// Build reverse lookup: normalized title → { category, max }[]
const TITLE_MAX_LOOKUP: Record<string, { category: string; max: number }[]> = {};
const TITLE_ALIASES: Record<string, string> = {
  HW: "HOMEWORK",
  H_W: "HOMEWORK",
};
for (const [cat, titles] of Object.entries(EXAM_MARK_MAXIMUMS)) {
  for (const [title, max] of Object.entries(titles)) {
    const norm = title.toUpperCase().replace(/[\s-]/g, "");
    if (!TITLE_MAX_LOOKUP[norm]) TITLE_MAX_LOOKUP[norm] = [];
    TITLE_MAX_LOOKUP[norm].push({ category: cat, max });
    // Add aliases
    for (const [alias, target] of Object.entries(TITLE_ALIASES)) {
      if (norm === target) {
        if (!TITLE_MAX_LOOKUP[alias]) TITLE_MAX_LOOKUP[alias] = [];
        TITLE_MAX_LOOKUP[alias].push({ category: cat, max });
      }
    }
  }
}

// ─── Split ───────────────────────────────────────────────────────────────────

export function splitDocument(md: string): DocBlock[] {
  const lines = md.split("\n");
  const blocks: DocBlock[] = [];
  let current: DocBlock | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isH1 = line.startsWith("# ");
    const isSection = line.startsWith("## ");

    if (isH1 || isSection) {
      if (current) {
        current.endLine = i;
        current.body = current.body.replace(/\n+$/, "");
      }
      current = {
        type: isH1 ? "h1" : "section",
        heading: isH1 ? line.slice(2).trim() : line.slice(3).trim(),
        body: "",
        startLine: i,
        endLine: i,
      };
      blocks.push(current);
    } else if (current) {
      if (current.body) current.body += "\n";
      current.body += line;
      current.endLine = i + 1;
    }
  }

  // Trim trailing blank lines from each block's body
  for (const b of blocks) {
    b.body = b.body.replace(/\n+$/, "");
  }

  return blocks;
}

function joinBlocks(blocks: DocBlock[]): string {
  return blocks
    .map((b) => {
      const heading = b.type === "h1" ? `# ${b.heading ?? ""}` : `## ${b.heading ?? ""}`;
      if (!b.body) return heading;
      return `${heading}\n${b.body}`;
    })
    .join("\n");
}

function headingToSectionKind(heading: string | null): SectionKind | null {
  if (!heading) return null;
  const key = `## ${heading}`;
  return CANONICAL_HEADINGS[key] ?? null;
}

// ─── Detect category from a block's body ─────────────────────────────────────

function detectCategoryFromBlock(block: DocBlock | null): Category | null {
  if (!block) return null;
  const m = block.body.match(/(?:^|\n)\|\s*Category\s*\|\s*(.+?)\s*\|/i);
  if (m) {
    const raw = m[1].replace(/<[^>]*>/g, "").trim().toLowerCase().replace(/[\s-]/g, "");
    for (const [key, val] of Object.entries(CATEGORY_MAP)) {
      if (raw.includes(key)) return val;
    }
  }
  const m2 = block.body.match(/(?:^|\n)-\s*\*{0,2}Category\*{0,2}:\s*(.+?)(?:\n|$)/i);
  if (m2) {
    const raw = m2[1].replace(/<[^>]*>/g, "").trim().toLowerCase().replace(/[\s-]/g, "");
    for (const [key, val] of Object.entries(CATEGORY_MAP)) {
      if (raw.includes(key)) return val;
    }
  }
  return null;
}

// ─── Extract raw table from a block body ────────────────────────────────────

function extractRawTable(body: string): { headerIndex: number; headerLine: string; rows: string[] } | null {
  const lines = body.split("\n");
  let headerIndex = -1;
  let headerLine = "";
  let sepFound = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("|")) continue;
    if (trimmed.startsWith("|---") || /^\|[\s:]+-/.test(trimmed)) {
      sepFound = true;
      continue;
    }
    if (headerIndex === -1) {
      headerIndex = i;
      headerLine = trimmed;
    } else {
      const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length > 0) break;
    }
  }

  if (headerIndex === -1) return null;

  const rows: string[] = [];
  for (let i = headerIndex; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("|")) break;
    if (/^\|[\s:]*-+[\s:]*\|/.test(trimmed)) continue;
    rows.push(trimmed);
  }

  const dataRows = sepFound ? rows.slice(1) : rows.slice(1);
  return { headerIndex, headerLine, rows: dataRows };
}

interface ParsedTableRow {
  cells: string[];
}

function parseTableLine(line: string): string[] {
  return line.split("|").slice(1, -1).map((c) => c.trim());
}

function isAllNonNumeric(values: string[]): boolean {
  if (values.length === 0) return false;
  return values.every((v) => {
    const trimmed = v.replace(/<[^>]*>/g, "").trim();
    if (!trimmed) return false;
    return isNaN(Number(trimmed));
  });
}

// ─── Diagnose ────────────────────────────────────────────────────────────────

export function diagnoseStructure(blocks: DocBlock[]): StructureDiagnostic[] {
  const diags: StructureDiagnostic[] = [];

  // Find blocks by type
  const h1Block = blocks.find((b) => b.type === "h1");
  const h1Blocks = blocks.filter((b) => b.type === "h1");

  const sections = blocks.filter((b) => b.type === "section");
  const schoolBlock = sections.find((b) => headingToSectionKind(b.heading) === "school") ?? null;
  const studentBlock = sections.find((b) => headingToSectionKind(b.heading) === "student") ?? null;
  const academicBlock = sections.find((b) => headingToSectionKind(b.heading) === "academic") ?? null;
  const ratingsBlock = sections.find((b) => headingToSectionKind(b.heading) === "ratings") ?? null;
  const remarkBlock = sections.find((b) => headingToSectionKind(b.heading) === "remark") ?? null;

  // H1
  if (h1Blocks.length === 0) {
    diags.push({ code: "H1_MISSING", severity: "error", section: "h1", message: "Missing H1 title line (# Name — ExamTitle)" });
  } else if (h1Block && !h1Block.heading?.includes("—")) {
    diags.push({ code: "H1_MALFORMED", severity: "error", section: "h1", message: `H1 title missing "—" separator: "${h1Block.heading}"` });
  }

  // School
  if (!schoolBlock) {
    diags.push({ code: "SCHOOL_SECTION_MISSING", severity: "warning", section: "school", message: "Missing ## School Information section" });
  } else {
    const bulletRe = /^- \*\*(.+?)\*\*(?::|\s|$)/m;
    const pipeTableRe = /^\|/m;
    const plainBulletRe = /^- [^*].+:/m;
    const hasBullets = bulletRe.test(schoolBlock.body);
    const isPipeTable = pipeTableRe.test(schoolBlock.body);
    const isPlainBullet = plainBulletRe.test(schoolBlock.body);
    if (!hasBullets && isPipeTable) {
      diags.push({ code: "SCHOOL_BULLET_FORMAT_WRONG", severity: "error", section: "school", message: "School Information uses pipe table instead of bullet list" });
    } else if (!hasBullets && isPlainBullet) {
      diags.push({ code: "SCHOOL_BULLET_FORMAT_WRONG", severity: "error", section: "school", message: "School Information bullets missing ** on keys" });
    } else if (!hasBullets && !isPipeTable && schoolBlock.body.trim()) {
      diags.push({ code: "SCHOOL_BULLET_FORMAT_WRONG", severity: "error", section: "school", message: "School Information content is not in - **Key:** val format" });
    } else if (hasBullets && /^- \*\*.*?- \*\*/m.test(schoolBlock.body)) {
      diags.push({ code: "SCHOOL_BULLETS_FLATTENED", severity: "error", section: "school", message: "School Information has multiple fields on one line; each field must be its own bullet item" });
    }
  }

  // Student
  if (!studentBlock) {
    diags.push({ code: "STUDENT_SECTION_MISSING", severity: "error", section: "student", message: "Missing ## Student Information section" });
  } else {
    const isPipeTable = /^\|/m.test(studentBlock.body);
    const isBulletList = /^- \*\*(.+?)\*\*(?::|\s|$)/m.test(studentBlock.body);
    if (!isPipeTable && isBulletList) {
      diags.push({ code: "STUDENT_TABLE_MALFORMED", severity: "error", section: "student", message: "Student Information uses bullet list instead of pipe table" });
    } else if (!isPipeTable && !isBulletList && studentBlock.body.trim()) {
      diags.push({ code: "STUDENT_TABLE_MALFORMED", severity: "error", section: "student", message: "Student Information content is not in | Field | Details | format" });
    } else if (isPipeTable) {
      const rawTable = extractRawTable(studentBlock.body);
      if (rawTable) {
        const fieldNames = rawTable.rows.map((r) => parseTableLine(r)[0]?.trim().toLowerCase() ?? "");
        const missing = [...REQUIRED_STUDENT_ROWS].filter((f) => !fieldNames.some((n) => n.includes(f)));
        if (missing.length > 0) {
          diags.push({
            code: "STUDENT_FIELD_ROW_MISSING",
            severity: "error",
            section: "student",
            message: `Student Information missing required fields: ${missing.join(", ")}`,
          });
        }
      }
    }
  }

  // Academic
  if (!academicBlock) {
    diags.push({ code: "ACADEMIC_SECTION_MISSING", severity: "error", section: "academic", message: "Missing ## Academic Performance section" });
  } else {
    const category = detectCategoryFromBlock(studentBlock);
    const rawTable = extractRawTable(academicBlock.body);
    const allTableLines = academicBlock.body.split("\n").filter((l) => l.trim().startsWith("|"));
    const tablesInSection = countTables(academicBlock.body);

    if (!rawTable && allTableLines.length === 0) {
      diags.push({ code: "ACADEMIC_TABLE_MISSING", severity: "error", section: "academic", message: "Academic Performance section has no pipe table" });
    } else if (rawTable) {
      const headerCells = parseTableLine(rawTable.headerLine);
      if (headerCells.length > 0 && headerCells[0].toLowerCase() !== "subject code") {
        diags.push({ code: "ACADEMIC_FIRST_COLUMN_WRONG", severity: "error", section: "academic", message: `First column header is "${headerCells[0]}", expected "Subject Code"` });
      }

      if (category === "DAYCARE") {
        const hasLO = headerCells.some((h) => /^learning\s*outcome$/i.test(h));
        if (!hasLO) {
          diags.push({ code: "ACADEMIC_LO_COLUMN_REQUIRED", severity: "error", section: "academic", message: "DAYCARE requires a Learning Outcome column" });
        }
      } else if (category && category !== "DAYCARE") {
        const hasLO = headerCells.some((h) => /^learning\s*outcome$/i.test(h));
        if (hasLO) {
          diags.push({ code: "ACADEMIC_LO_COLUMN_UNEXPECTED", severity: "warning", section: "academic", message: "Non-DAYCARE category has Learning Outcome column" });
        }
      }

      const assessmentHeaders = headerCells.slice(1).filter((h) => !/^learning\s*outcome$/i.test(h));
      for (const h of assessmentHeaders) {
        if (h.trim() && !/\((\d+)\)$/.test(h.trim())) {
          diags.push({ code: "ACADEMIC_HEADER_MISSING_MAX", severity: "error", section: "academic", message: `Assessment header "${h}" missing (max) value` });
        }
      }

      if (rawTable.rows.length === 0) {
        diags.push({ code: "ACADEMIC_NO_DATA_ROWS", severity: "error", section: "academic", message: "Academic Performance table has no data rows" });
      }
    }

    if (tablesInSection > 1) {
      diags.push({ code: "ACADEMIC_MULTIPLE_TABLES", severity: "error", section: "academic", message: `Academic Performance has ${tablesInSection} tables, expected 1` });
    }
  }

  // Ratings
  if (!ratingsBlock) {
    diags.push({ code: "RATINGS_SECTION_MISSING", severity: "error", section: "ratings", message: "Missing ## Learner's Rating section" });
  } else {
    const isPipeTable = /^\|/m.test(ratingsBlock.body);
    const isBulletList = /^- \*\*(.+?)\*\*(?::|\s|$)/m.test(ratingsBlock.body);
    if (!isPipeTable && isBulletList) {
      diags.push({ code: "RATINGS_TABLE_MALFORMED", severity: "error", section: "ratings", message: "Learner's Rating uses bullet list instead of pipe table" });
    } else if (!isPipeTable && ratingsBlock.body.trim()) {
      diags.push({ code: "RATINGS_TABLE_MALFORMED", severity: "error", section: "ratings", message: "Learner's Rating content is not in | Trait | Rating | format" });
    }
  }

  // Remark
  if (!remarkBlock) {
    diags.push({ code: "REMARK_SECTION_MISSING", severity: "error", section: "remark", message: "Missing ## Teacher's Remark section" });
  } else {
    const hasBlockquote = />\s*/.test(remarkBlock.body);
    if (!hasBlockquote && remarkBlock.body.trim()) {
      diags.push({ code: "REMARK_BLOCKQUOTE_MISSING", severity: "error", section: "remark", message: "Teacher's Remark not wrapped in > blockquote" });
    }
  }

  // Document-level
  const seen = new Set<string>();
  for (const b of sections) {
    if (seen.has(b.heading ?? "")) {
      diags.push({ code: "DUPLICATE_SECTION", severity: "error", section: "academic", message: `Duplicate section heading: ## ${b.heading}` });
    }
    seen.add(b.heading ?? "");
  }

  const foundKinds = sections.map((b) => headingToSectionKind(b.heading)).filter(Boolean) as SectionKind[];
  const canonical = CANONICAL_ORDER.filter((k) => foundKinds.includes(k));
  for (let i = 0; i < canonical.length; i++) {
    if (canonical[i] !== foundKinds[i]) {
      diags.push({ code: "SECTION_OUT_OF_ORDER", severity: "error", section: "academic", message: `Sections out of order: expected ${canonical[i]} after ${canonical[i - 1] ?? "start"}, found ${foundKinds[i]}` });
      break;
    }
  }

  for (const b of sections) {
    const kind = headingToSectionKind(b.heading);
    if (!kind) {
      diags.push({ code: "EXTRA_SECTION", severity: "warning", section: "academic", message: `Unknown section: ## ${b.heading}` });
    }
  }

  return diags;
}

function countTables(body: string): number {
  const lines = body.split("\n");
  let count = 0;
  let inTable = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|") && t.includes("---")) continue;
    if (t.startsWith("|")) {
      if (!inTable) {
        count++;
        inTable = true;
      }
    } else {
      inTable = false;
    }
  }
  return count;
}

// ─── Fix helpers ─────────────────────────────────────────────────────────────

function pipeTableToBullets(body: string): string {
  return body
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) => {
      const cells = parseTableLine(l);
      if (cells.length < 2) return null;
      const key = cells[0].replace(/<[^>]*>/g, "").trim();
      const val = cells.slice(1).join(" ").replace(/<[^>]*>/g, "").trim();
      if (!key || key.toLowerCase() === "field") return null;
      return `- **${key}:** ${val}`;
    })
    .filter(Boolean)
    .join("\n");
}

function bulletsToPipeTable(body: string): string {
  const rows: string[] = [];
  const re = /^-\s+\*\*(.+?)\*\*(?::\s*|\s+)(.*)$/;
  for (const line of body.split("\n")) {
    const m = line.match(re);
    if (m) {
      const key = m[1].replace(/:+\s*$/, '').trim();
      const val = m[2].trim();
      rows.push(`| ${key} | ${val} |`);
    }
  }
  if (rows.length === 0) return body;
  return `| Field | Details |\n|---|---|\n${rows.join("\n")}`;
}

function fixMissingBoldInBullets(body: string): string {
  return body.replace(/^-\s+(?!\*\*)(.+?):\s*(.*?)$/gm, "- **$1:** $2");
}

function ratingsBulletsToTable(body: string): string {
  const rows: string[] = [];
  const re = /^-\s+\*\*(.+?)\*\*(?::\s*|\s+)(.*)$/;
  for (const line of body.split("\n")) {
    const m = line.match(re);
    if (m) {
      const key = m[1].replace(/:+\s*$/, '').trim();
      const val = m[2].trim();
      rows.push(`| ${key} | ${val} |`);
    }
  }
  if (rows.length === 0) return body;
  return `| Trait | Rating |\n|---|---|\n${rows.join("\n")}`;
}

function wrapInBlockquote(body: string): string {
  if (!body.trim()) return body;
  return body
    .split("\n")
    .map((l) => (l.trim() ? `> ${l}` : ">"))
    .join("\n");
}

function renameFirstColumnHeader(body: string, newName: string): string {
  const lines = body.split("\n");
  const result: string[] = [];
  let found = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      result.push(line);
      continue;
    }
    if (/^\|[\s:]*-+[\s:]*\|/.test(trimmed)) {
      result.push(line);
      continue;
    }
    if (!found) {
      const cells = parseTableLine(trimmed);
      if (cells.length > 0) {
        cells[0] = newName;
        result.push(`| ${cells.join(" | ")} |`);
        found = true;
        continue;
      }
    }
    result.push(line);
  }
  return result.join("\n");
}

function addMissingMaxToHeaders(body: string, category: Category | null): string {
  const lines = body.split("\n");
  const result: string[] = [];
  let headerProcessed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      result.push(line);
      continue;
    }
    if (/^\|[\s:]*-+[\s:]*\|/.test(trimmed)) {
      result.push(line);
      continue;
    }

    if (!headerProcessed) {
      const cells = parseTableLine(trimmed);
      const newCells = cells.map((c, i) => {
        if (i === 0) return c;
        const stripped = c.replace(/<[^>]*>/g, "").trim();
        if (/\((\d+)\)$/.test(stripped)) return c;
        if (/^learning\s*outcome$/i.test(stripped)) return c;
        const norm = stripped.toUpperCase().replace(/[\s/-]/g, "");
        const matches = TITLE_MAX_LOOKUP[norm];
        if (!matches || matches.length === 0) return c;
        let max: number | null = null;
        if (matches.length === 1) {
          max = matches[0].max;
        } else if (category) {
          const catMatch = matches.find((m) => m.category === category);
          if (catMatch) max = catMatch.max;
        }
        // Fallback: use highest max regardless of category
        if (max === null) {
          max = Math.max(...matches.map((m) => m.max));
        }
        if (max !== null) {
          return `${stripped} (${max})`;
        }
        return c;
      });
      result.push(`| ${newCells.join(" | ")} |`);
      headerProcessed = true;
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

function detectLOColumn(body: string): string {
  const lines = body.split("\n");
  const result: string[] = [];
  let inHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      result.push(line);
      continue;
    }
    if (/^\|[\s:]*-+[\s:]*\|/.test(trimmed)) {
      result.push(line);
      inHeader = false;
      continue;
    }

    if (inHeader) {
      const cells = parseTableLine(trimmed);
      const hasLO = cells.some((c) => /^learning\s*outcome$/i.test(c));
      if (hasLO) {
        result.push(line);
      } else if (cells.length === 2) {
        // 2-column table: Subject Code + unnamed second column → rename to LO
        cells[cells.length - 1] = "Learning Outcome";
        result.push(`| ${cells.join(" | ")} |`);
      } else if (cells.length > 2) {
        // 3+ columns: check if last column values are non-numeric
        const dataLines = lines.slice(lines.indexOf(line) + 1).filter((l) => l.trim().startsWith("|") && !/^\|[\s:]*-+[\s:]*\|/.test(l));
        const lastColValues = dataLines.map((dl) => {
          const dc = parseTableLine(dl);
          return dc[dc.length - 1] ?? "";
        });
        if (isAllNonNumeric(lastColValues)) {
          cells[cells.length - 1] = "Learning Outcome";
          result.push(`| ${cells.join(" | ")} |`);
        } else {
          result.push(line);
        }
      } else {
        result.push(line);
      }
      inHeader = false;
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

function mergeMultipleTables(body: string): string {
  const rawLines = body.split("\n");
  const tables: { headerLine: string; dataLines: string[] }[] = [];
  let currentTable: { headerLine: string; dataLines: string[] } | null = null;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      currentTable = null;
      continue;
    }
    if (/^\|[\s:]*-+[\s:]*\|/.test(trimmed)) {
      continue;
    }
    if (!currentTable) {
      currentTable = { headerLine: trimmed, dataLines: [] };
      tables.push(currentTable);
    } else {
      currentTable.dataLines.push(trimmed);
    }
  }

  if (tables.length <= 1) return body;

  const base = tables[0];
  const baseCells = parseTableLine(base.headerLine);

  for (let t = 1; t < tables.length; t++) {
    const table = tables[t];
    const tableCells = parseTableLine(table.headerLine);
    const isCompatible =
      tableCells.length === baseCells.length ||
      baseCells.every((c, i) => tableCells[i] === c);

    if (isCompatible) {
      base.dataLines.push(...table.dataLines);
    } else {
      // Try column alignment by name
      const baseCols = new Map(baseCells.map((c, i) => [c, i]));
      for (const dataLine of table.dataLines) {
        const cells = parseTableLine(dataLine);
        const newRow = new Array(baseCells.length).fill("");
        for (let i = 0; i < tableCells.length; i++) {
          const colIdx = baseCols.get(tableCells[i]);
          if (colIdx !== undefined && colIdx < newRow.length) {
            newRow[colIdx] = cells[i] ?? "";
          }
        }
        base.dataLines.push(`| ${newRow.join(" | ")} |`);
      }
    }
  }

  // Rebuild: header + separator + merged data
  const sep = `|${baseCells.map(() => "---").join(" | ")}|`;
  return `| ${baseCells.join(" | ")} |\n${sep}\n${base.dataLines.join("\n")}`;
}

// ─── Reconstruct H1 from student block ──────────────────────────────────────

function reconstructH1(studentBlock: DocBlock | null): { name: string; title: string } | null {
  if (!studentBlock) return null;

  const nameMatch = studentBlock.body.match(/(?:^|\n)\|\s*Full Name\s*\|\s*(.+?)\s*\|/i);
  const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, "").replace(/^@/, "").trim() : "";

  const termMatch = studentBlock.body.match(/(?:^|\n)\|\s*Term\s*\|\s*(.+?)\s*\|/i);
  const term = termMatch ? termMatch[1].replace(/<[^>]*>/g, "").replace(/^@/, "").trim() : "";

  if (name && term) return { name, title: term };
  if (name) return { name, title: "EXAMINATION" };
  return null;
}

function fixFlattenedSchoolBullets(body: string): string {
  return body.replace(/^- \*\*([^*]+)\*\*[:\s]*(.*)$/gm, (line, key, val) => {
    if (!val.includes("- **")) return line;
    const bullets: string[] = [];
    const parts = val.split(/(?=\s*- \*\*)/);
    for (let i = 0; i < parts.length; i++) {
      const m = parts[i].match(/-\s+\*\*([^*]+)\*\*[:\s]*(.*)/);
      if (m) {
        bullets.push(`- **${m[1].trim()}:** ${m[2].trim()}`);
      } else if (i === 0) {
        // First part is the value of the original key
        bullets.push(`- **${key.trim()}:** ${parts[i].trim()}`);
      }
    }
    return bullets.join("\n");
  });
}

// ─── Fix rounds ──────────────────────────────────────────────────────────────

function fixRound1(blocks: DocBlock[], diags: StructureDiagnostic[], fixes: FixRecord[]): void {
  // Remove extra sections
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type !== "section") continue;
    const code = `EXTRA_SECTION` as DiagnosticCode;
    if (diags.some((d) => d.code === code && d.section === "academic" && d.message.includes(b.heading ?? ""))) {
      blocks.splice(i, 1);
      fixes.push({ section: "academic", code: "EXTRA_SECTION", description: `Removed unknown section: ## ${b.heading}` });
    }
  }

  // Remove duplicate sections (keep last)
  const seen = new Set<string>();
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type !== "section") continue;
    const key = b.heading ?? "";
    if (seen.has(key)) {
      blocks.splice(i, 1);
      fixes.push({ section: "academic", code: "DUPLICATE_SECTION", description: `Removed duplicate section: ## ${key}` });
    }
    seen.add(key);
  }

  // Reorder to canonical
  const h1Block = blocks.find((b) => b.type === "h1");
  const sectionBlocks = blocks.filter((b) => b.type === "section");
  const ordered: DocBlock[] = [];
  const remaining = new Set(sectionBlocks);

  for (const kind of CANONICAL_ORDER) {
    const headingKey = Object.entries(CANONICAL_HEADINGS).find(([, v]) => v === kind)?.[0];
    if (!headingKey) continue;
    const h = headingKey.replace("## ", "");
    const block = sectionBlocks.find((b) => b.heading === h);
    if (block && remaining.has(block)) {
      ordered.push(block);
      remaining.delete(block);
    }
  }

  // Add any remaining sections that weren't in canonical order
  ordered.push(...remaining);

  const newBlocks: DocBlock[] = [];
  if (h1Block) newBlocks.push(h1Block);
  newBlocks.push(...ordered);

  // Check if order changed
  const oldOrder = blocks.map((b) => b.heading).join(",");
  const newOrder = newBlocks.map((b) => b.heading).join(",");
  if (oldOrder !== newOrder) {
    fixes.push({ section: "academic", code: "SECTION_OUT_OF_ORDER", description: "Reordered sections to canonical sequence" });
  }

  blocks.length = 0;
  blocks.push(...newBlocks);
}

function fixRound2(blocks: DocBlock[], diags: StructureDiagnostic[], fixes: FixRecord[]): void {
  for (const b of blocks) {
    if (b.type !== "section") continue;
    const kind = headingToSectionKind(b.heading);
    if (!kind) continue;
    const originalBody = b.body;

    switch (kind) {
      case "school": {
        const flattened = diags.some((d) => d.code === "SCHOOL_BULLETS_FLATTENED" && d.section === "school");
        if (flattened) {
          b.body = fixFlattenedSchoolBullets(b.body);
          break;
        }
        const bulletWrong = diags.some((d) => d.code === "SCHOOL_BULLET_FORMAT_WRONG" && d.section === "school");
        if (!bulletWrong) break;

        const isPipeTable = /^\|/m.test(b.body);
        const isPlainBullet = /^-(?!\s*\*\*)/m.test(b.body);

        if (isPipeTable) {
          b.body = pipeTableToBullets(b.body);
        } else if (isPlainBullet) {
          b.body = fixMissingBoldInBullets(b.body);
        }
        break;
      }
      case "student": {
        const tableWrong = diags.some((d) => d.code === "STUDENT_TABLE_MALFORMED" && d.section === "student");
        if (!tableWrong) break;

        const isBulletList = /^- \*\*(.+?)\*\*(?::|\s|$)/m.test(b.body);
        if (isBulletList) {
          b.body = bulletsToPipeTable(b.body);
        }
        break;
      }
      case "ratings": {
        const tableWrong = diags.some((d) => d.code === "RATINGS_TABLE_MALFORMED" && d.section === "ratings");
        if (!tableWrong) break;

        const isBulletList = /^- \*\*(.+?)\*\*(?::|\s|$)/m.test(b.body);
        if (isBulletList) {
          b.body = ratingsBulletsToTable(b.body);
        }
        break;
      }
      case "remark": {
        const missingBq = diags.some((d) => d.code === "REMARK_BLOCKQUOTE_MISSING" && d.section === "remark");
        if (!missingBq) break;
        b.body = wrapInBlockquote(b.body);
        break;
      }
    }

    if (b.body !== originalBody) {
      fixes.push({ section: kind, code: diags.find((d) => d.section === kind)?.code ?? "ACADEMIC_TABLE_MISSING", description: `Fixed ${kind} section format` });
    }
  }
}

function fixRound3(blocks: DocBlock[], diags: StructureDiagnostic[], fixes: FixRecord[]): void {
  const academicBlock = blocks.find((b) => b.type === "section" && headingToSectionKind(b.heading) === "academic");
  const studentBlock = blocks.find((b) => b.type === "section" && headingToSectionKind(b.heading) === "student");
  if (!academicBlock) return;

  const category = detectCategoryFromBlock(studentBlock);
  const originalBody = academicBlock.body;

  const firstColWrong = diags.some((d) => d.code === "ACADEMIC_FIRST_COLUMN_WRONG" && d.section === "academic");
  if (firstColWrong) {
    academicBlock.body = renameFirstColumnHeader(academicBlock.body, "Subject Code");
  }

  const missingMax = diags.some((d) => d.code === "ACADEMIC_HEADER_MISSING_MAX" && d.section === "academic");
  if (missingMax) {
    academicBlock.body = addMissingMaxToHeaders(academicBlock.body, category);
  }

  const loRequired = diags.some((d) => d.code === "ACADEMIC_LO_COLUMN_REQUIRED" && d.section === "academic");
  if (loRequired) {
    academicBlock.body = detectLOColumn(academicBlock.body);
  }

  const multipleTables = diags.some((d) => d.code === "ACADEMIC_MULTIPLE_TABLES" && d.section === "academic");
  if (multipleTables) {
    academicBlock.body = mergeMultipleTables(academicBlock.body);
  }

  if (academicBlock.body !== originalBody) {
    fixes.push({ section: "academic", code: diags.find((d) => d.section === "academic")?.code ?? "ACADEMIC_TABLE_MISSING", description: "Fixed Academic Performance table structure" });
  }
}

function fixRound4(blocks: DocBlock[], diags: StructureDiagnostic[], fixes: FixRecord[]): void {
  const h1Block = blocks.find((b) => b.type === "h1");
  const h1Missing = diags.some((d) => d.code === "H1_MISSING" || d.code === "H1_MALFORMED");
  if (!h1Missing) return;

  const studentBlock = blocks.find((b) => b.type === "section" && headingToSectionKind(b.heading) === "student");
  const reconstructed = reconstructH1(studentBlock);

  if (reconstructed) {
    const h1Line = `# ${reconstructed.name} — ${reconstructed.title}`;
    if (h1Block) {
      h1Block.heading = `${reconstructed.name} — ${reconstructed.title}`;
      h1Block.body = "";
    } else {
      blocks.unshift({ type: "h1", heading: `${reconstructed.name} — ${reconstructed.title}`, body: "", startLine: 0, endLine: 1 });
    }
    fixes.push({ section: "h1", code: "H1_MALFORMED", description: `Reconstructed H1 as: ${h1Line}` });
  }
}

// ─── Auto-fix entry point ────────────────────────────────────────────────────

export function autoFixStructure(md: string): AutoFixResult {
  const blocks = splitDocument(md);
  let diags = diagnoseStructure(blocks);
  const fixes: FixRecord[] = [];

  // Only proceed if there are error-level diagnostics
  const errors = diags.filter((d) => d.severity === "error");
  if (errors.length === 0) {
    const parsed = parseMarksheetMarkdown(md);
    return { fixedMd: md, fixes: [], unresolved: [], parsed };
  }

  // Four linear passes with re-diagnosis between each.
  // Each pass is idempotent and targets a specific class of issues.
  // Re-diagnosis ensures the next pass works with accurate state.

  const takeSnapshot = () => joinBlocks(blocks);

  let snap = takeSnapshot();
  fixRound1(blocks, diags.filter((d) => d.severity === "error"), fixes);
  if (takeSnapshot() !== snap) {
    diags = diagnoseStructure(blocks);
    snap = takeSnapshot();
  }

  fixRound2(blocks, diags.filter((d) => d.severity === "error"), fixes);
  if (takeSnapshot() !== snap) {
    diags = diagnoseStructure(blocks);
    snap = takeSnapshot();
  }

  fixRound3(blocks, diags.filter((d) => d.severity === "error"), fixes);
  if (takeSnapshot() !== snap) {
    diags = diagnoseStructure(blocks);
    snap = takeSnapshot();
  }

  fixRound4(blocks, diags.filter((d) => d.severity === "error"), fixes);
  // No re-diagnose after Round 4 — it's the last pass

  const fixedMd = joinBlocks(blocks);
  const finalDiags = diagnoseStructure(blocks);
  const parsed = parseMarksheetMarkdown(fixedMd);

  return {
    fixedMd,
    fixes,
    unresolved: finalDiags.filter((d) => d.severity === "error"),
    parsed,
  };
}
