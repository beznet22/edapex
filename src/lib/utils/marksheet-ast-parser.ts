import type { Marksheet, Category } from "$lib/schema/marksheet";
import { EXAM_MARK_MAXIMUMS } from "$lib/constants/assessment";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import type { Root } from "mdast";

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

export interface MentionData {
  studentId: number | null;
  examTypeId: number | null;
  academicId: number | null;
  admissionNo: number | null;
  studentName: string | null;
}

export function parseMentions(md: string): MentionData {
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

function stripHtml(val: string): string {
  return val.replace(/<[^>]*>/g, "").replace(/^@/, "").trim();
}

function extractTitleLine(md: string): { fullName: string; title: string } {
  const m = /^#\s+(.+?)\s*—\s*(.+?)\s*$/m.exec(md);
  if (m) {
    return { fullName: m[1].trim(), title: m[2].trim() };
  }
  return { fullName: "", title: "" };
}

// ─── AST helpers ─────────────────────────────────────────────────────────────

function parseMd(md: string): Root {
  return fromMarkdown(md, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

function getNodeText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.value;
  if (node.type === "html") return "";
  if (node.type === "inlineCode") return node.value;
  if (node.children) return node.children.map(getNodeText).join("");
  return "";
}

function getCellText(cell: any): string {
  if (!cell || !cell.children) return "";
  return cell.children.map(getNodeText).join("").trim();
}

function findSection(tree: Root, headingName: string): any[] | null {
  let result: any[] | null = null;
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i];
    if (node.type !== "heading") continue;
    const text = getNodeText(node);
    if (text === headingName) {
      const start = i + 1;
      let end = tree.children.length;
      for (let j = start; j < tree.children.length; j++) {
        if (tree.children[j].type === "heading") {
          end = j;
          break;
        }
      }
      result = tree.children.slice(start, end);
      break;
    }
  }
  return result;
}

function findTableInNodes(nodes: any[]): any | null {
  for (const n of nodes) {
    if (n.type === "table") return n;
  }
  return null;
}

function findBlockquoteInNodes(nodes: any[]): any | null {
  for (const n of nodes) {
    if (n.type === "blockquote") return n;
  }
  return null;
}

function findListInNodes(nodes: any[]): any | null {
  for (const n of nodes) {
    if (n.type === "list") return n;
  }
  return null;
}

function parseTableToKV(table: any): Record<string, string> {
  const kv: Record<string, string> = {};
  // Skip separator row (if present, already handled by mdast)
  // data rows start at index 0 (header is index 0 in mdast)
  // mdast-util-gfm keeps header as first row, no separator row
  const rows = table.children;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.children || row.children.length < 2) continue;
    const key = getCellText(row.children[0]).toLowerCase();
    const val = getCellText(row.children[1]);
    if (key === "field" && val.toLowerCase() === "details") continue;
    kv[key] = val;
  }
  return kv;
}

// ─── Rewritten parsing helpers (AST-based) ───────────────────────────────────

function parseSchoolInfoFromTree(tree: Root): Marksheet["school"] {
  const section = findSection(tree, "School Information");
  if (!section) {
    return { id: 0, name: "", email: "", phone: "", city: "", state: "", title: "", vacation_date: "" };
  }

  const map: Record<string, string> = {};
  const list = findListInNodes(section);
  if (list) {
    for (const item of list.children) {
      const text = getNodeText(item);
      const m = text.match(/^\s*\*\*([^*]+)\*\*\s*(.+)/);
      if (m) {
        const key = m[1].trim().replace(/:$/, "").toLowerCase().replace(/\s+/g, "_");
        map[key] = m[2].trim();
      }
    }
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

function parseStudentInfoFromTree(tree: Root, md: string, mentions: ReturnType<typeof parseMentions>): Marksheet["student"] & { categoryRaw?: string } {
  const section = findSection(tree, "Student Information");
  if (!section) {
    return { id: 0, examTypeId: 0, fullName: "", gender: "", parentEmail: "", parentName: "", term: "", title: "", category: "DAYCARE", className: "", sectionName: "", adminNo: 0, sessionYear: "", daysOpened: 0, daysAbsent: 0, daysPresent: 0, token: "" };
  }

  const kv: Record<string, string> = {};
  const table = findTableInNodes(section);
  if (table) {
    Object.assign(kv, parseTableToKV(table));
  }
  const list = findListInNodes(section);
  if (list) {
    for (const item of list.children) {
      const text = getNodeText(item);
      const m = text.match(/^\s*\*\*([^*]+)\*\*\s*(.+)/);
      if (m) {
        const key = m[1].trim().toLowerCase();
        kv[key] = m[2].trim();
      }
    }
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
			title: examTitle || "",
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

function extractSubjectsAndRecordsFromTree(tree: Root, studentId: number, category: Category, mapping?: ParseContextMappingSubject[]): { subjects: Marksheet["subjects"]; records: Marksheet["records"] } {
  const section = findSection(tree, "Academic Performance");
  if (!section) return { subjects: [], records: [] };

  const table = findTableInNodes(section);
  if (!table || table.children.length < 2) return { subjects: [], records: [] };

  const headerRow = table.children[0];
  const dataRows = table.children.slice(1);

  const titles: string[] = [];
  const fullMarks: number[] = [];
  let loCol = -1;

  for (let i = 1; i < headerRow.children.length; i++) {
    const h = getCellText(headerRow.children[i]);
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

  for (const row of dataRows) {
    if (!row.children || row.children.length < 2) continue;
    const subjectCode = getCellText(row.children[0]);
    if (!subjectCode || subjectCode.startsWith("**")) continue;

    const marks: number[] = [];
    for (let i = 1; i < row.children.length && i - 1 < nTitles; i++) {
      marks.push(Number(getCellText(row.children[i])) || 0);
    }

    let learningOutcome: string | null = null;
    if (loCol > 0 && loCol < row.children.length) {
      const raw = getCellText(row.children[loCol]);
      if (raw) learningOutcome = raw;
    }

    const matchedSubject = mapping?.find((m) => m.subjectCode.toUpperCase() === subjectCode.toUpperCase());
    subjects.push({ subjectId: matchedSubject?.id ?? null, subjectCode, teacherId: matchedSubject?.teacherId ?? null });
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
      grade: "",
      category,
      learningOutcome,
    });
  }

  return { subjects, records };
}

function parseRatingsFromTree(tree: Root): Marksheet["ratings"] {
  const section = findSection(tree, "Learner's Rating");
  if (!section) return [];

  const table = findTableInNodes(section);
  if (!table) return [];

  return table.children.slice(1).map((row: any) => {
    const attr = getCellText(row.children[0] ?? {}) ?? "";
    const rateStr = getCellText(row.children[1] ?? {}) ?? "";
    return {
      attribute: attr,
      rate: Number(rateStr) || null,
      remark: null,
      color: null,
    };
  });
}

function parseRemarkFromTree(tree: Root): { remark: string | null } {
  const section = findSection(tree, "Teacher's Remark");
  if (!section) return { remark: null };

  const bq = findBlockquoteInNodes(section);
  if (!bq) return { remark: null };

  const lines: string[] = [];
  for (const p of bq.children) {
    const text = getNodeText(p);
    if (text) lines.push(text);
  }
  const remark = lines.join("\n");
  return { remark: remark || null };
}

function extractExamTypeFromTree(tree: Root, md: string, mentions: ReturnType<typeof parseMentions>): Marksheet["examType"] | undefined {
  const section = findSection(tree, "Student Information");
  let termName = "";
  if (section) {
    const table = findTableInNodes(section);
    if (table) {
      for (const row of table.children) {
        if (row.children && row.children.length >= 2) {
          const key = getCellText(row.children[0]).toLowerCase();
          if (key === "term") {
            termName = stripHtml(getCellText(row.children[1]));
          }
        }
      }
    }
  }

  if (!mentions.examTypeId && !termName) return undefined;
  return {
    id: mentions.examTypeId ?? 0,
    title: termName || undefined,
  };
}

// ─── Context for enriching parsed output ─────────────────────────────────────

export interface ParseContextTenant {
  schoolId?: number;
  classId?: number;
  sectionId?: number;
  examTypeId?: number;
  academicId?: number;
  studentId?: number;
  admissionNo?: number;
  className?: string;
  sectionName?: string;
  academicYearTitle?: string;
  fullName?: string;
}

export interface ParseContextMappingSubject {
  id: number;
  subjectCode: string;
  teacherId: number;
}

export interface ParseContextRosterEntry {
  id: number;
  name: string;
  admissionNo?: number | string;
}

export interface ParseContext {
  tenant?: ParseContextTenant;
  school?: {
    name?: string;
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    title?: string;
    vacation_date?: string;
  };
  mapping?: {
    subjects?: ParseContextMappingSubject[];
  };
  roster?: ParseContextRosterEntry[];
  learningOutcomeFallback?: string;
}

function mergeContext(result: Marksheet, context?: ParseContext): Marksheet {
  if (!context) return result;

  const { tenant, school: schoolCtx, mapping, roster, learningOutcomeFallback } = context;

  // Resolve student from roster
  let resolvedStudentId = tenant?.studentId ?? null;
  let rosterMatch: ParseContextRosterEntry | undefined;

  if (tenant?.admissionNo != null) {
    // Stage 3: @mention admissionNo is authoriative, skip roster
    resolvedStudentId = tenant.studentId ?? null;
  } else if (roster && roster.length > 0) {
    const studentName = result.student.fullName;
    const studentAdmNo = result.student.adminNo;

    // Token-subset matching — handles reversed/misordered names
    const normalizeTokens = (s: string) =>
      s.toLowerCase().replace(/[,.-]+/g, '').replace(/[\u200b-\u200d\ufeff]/g, '').split(/\s+/).filter(Boolean);
    const nameTokens = normalizeTokens(studentName);
    const ranked = roster.map((r) => {
      const rosterTokens = normalizeTokens(r.name);

      // Admission number match → highest score
      const admMatch = studentAdmNo && r.admissionNo != null
        ? String(studentAdmNo) === String(r.admissionNo) : false;

      const markdownInRoster = nameTokens.length > 0 && rosterTokens.length > 0
        && nameTokens.every((t) => rosterTokens.includes(t));
      const rosterInMarkdown = nameTokens.length > 0 && rosterTokens.length > 0
        && rosterTokens.every((t) => nameTokens.includes(t));

      const score = admMatch ? 3
        : (markdownInRoster && rosterInMarkdown) ? 2
        : (markdownInRoster || rosterInMarkdown) ? 1
        : 0;
      return { entry: r, score };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);

    const topScore = ranked[0]?.score;
    if (topScore != null) {
      const tied = ranked.filter((r) => r.score === topScore);
      // Ambiguous: multiple same-name students at score 2 (bidirectional).
      if (topScore === 2 && tied.length > 1) {
        rosterMatch = undefined;
      } else {
        rosterMatch = tied[0].entry;
      }
    }
    if (rosterMatch) resolvedStudentId = rosterMatch.id;
  }

  // Build subjectCode → id map
  const subjectMap = new Map<string, number>();
  if (mapping?.subjects) {
    for (const s of mapping.subjects) {
      if (s.subjectCode && s.id != null) {
        subjectMap.set(s.subjectCode.toUpperCase(), s.id);
      }
    }
  }

  // ── School ──
  const school = { ...result.school };
  if (tenant?.schoolId != null) school.id = tenant.schoolId;
  if (schoolCtx?.name) school.name = schoolCtx.name;
  if (schoolCtx?.email) school.email = schoolCtx.email;
  if (schoolCtx?.phone) school.phone = schoolCtx.phone;
  if (schoolCtx?.city) school.city = schoolCtx.city;
  if (schoolCtx?.state) school.state = schoolCtx.state;
  if (schoolCtx?.title) school.title = schoolCtx.title;
  if (schoolCtx?.vacation_date) school.vacation_date = schoolCtx.vacation_date;

  // ── Student ──
  const student = { ...result.student };
  if (resolvedStudentId) student.id = resolvedStudentId;
  if (tenant?.examTypeId != null) student.examTypeId = tenant.examTypeId;
  if (tenant?.className) student.className = tenant.className;
  if (tenant?.sectionName) student.sectionName = tenant.sectionName;
  if (tenant?.fullName) student.fullName = tenant.fullName;
  if (tenant?.academicYearTitle && !student.sessionYear) {
    student.sessionYear = tenant.academicYearTitle;
  }
  // adminNo chain: table (stage 1) → roster (stage 2) → mentions (stage 3)
  if (tenant?.admissionNo != null) {
    student.adminNo = tenant.admissionNo;
  } else if (rosterMatch?.admissionNo != null) {
    student.adminNo = Number(rosterMatch.admissionNo) || 0;
  }
  student.token = `token-${student.adminNo || 0}`;

  // ── Subjects & Records ──
  const subjects = result.subjects.map((s) => {
    const sid = s.subjectCode
      ? subjectMap.get(s.subjectCode.toUpperCase()) ?? null
      : null;
    const matched = s.subjectCode
      ? mapping?.subjects?.find((m) => m.subjectCode.toUpperCase() === s.subjectCode?.toUpperCase())
      : undefined;
    return { ...s, subjectId: sid, teacherId: matched?.teacherId ?? s.teacherId };
  });

  const stId = resolvedStudentId ?? result.student.id;
  const records = result.records.map((r) => {
    const sid = r.subjectCode
      ? subjectMap.get(r.subjectCode.toUpperCase()) ?? null
      : 0;
    let lo = r.learningOutcome;
    if (
      r.category === "DAYCARE" &&
      (lo == null || lo === "")
    ) {
      lo =
        learningOutcomeFallback ??
        `${r.subjectCode}: Progressing`;
    }
    return { ...r, studentId: stId, subjectId: sid ?? 0, learningOutcome: lo };
  });

  // ── Exam type ──
  let examType = result.examType;
  if (tenant?.examTypeId != null) {
    examType = { ...(examType ?? {}), id: tenant.examTypeId };
  }

  return {
    ...result,
    school,
    student,
    subjects,
    records,
    examType,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function parseMarksheetMarkdown(markdown: string, context?: ParseContext): Marksheet {
  const tree = parseMd(markdown);
  const mentions = parseMentions(markdown);

  const school = parseSchoolInfoFromTree(tree);

  const studentPartial = parseStudentInfoFromTree(tree, markdown, mentions);

  const { subjects, records } = extractSubjectsAndRecordsFromTree(tree, studentPartial.id, studentPartial.category, context?.mapping?.subjects);

  const ratings = parseRatingsFromTree(tree);

  const remark = parseRemarkFromTree(tree);

  const examType = extractExamTypeFromTree(tree, markdown, mentions);

  const base: Marksheet = {
    school,
    student: studentPartial,
    subjects,
    records,
    ratings,
    remark,
    examType,
    recordId: null,
  };

  return mergeContext(base, context);
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
    for (const [alias, target] of Object.entries(TITLE_ALIASES)) {
      if (norm === target) {
        if (!TITLE_MAX_LOOKUP[alias]) TITLE_MAX_LOOKUP[alias] = [];
        TITLE_MAX_LOOKUP[alias].push({ category: cat, max });
      }
    }
  }
}

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

export function diagnoseStructure(blocks: DocBlock[]): StructureDiagnostic[] {
  const diags: StructureDiagnostic[] = [];

  const h1Block = blocks.find((b) => b.type === "h1");
  const h1Blocks = blocks.filter((b) => b.type === "h1");

  const sections = blocks.filter((b) => b.type === "section");

  // Check H1
  if (!h1Block) {
    diags.push({ code: "H1_MISSING", severity: "error", section: "h1", message: "Missing H1 heading" });
  } else if (h1Blocks.length > 1) {
    diags.push({ code: "DUPLICATE_SECTION", severity: "error", section: "h1", message: "Multiple H1 headings found" });
  } else {
    const h1Text = h1Block.heading ?? "";
    const hasDash = h1Text.includes("—") || h1Text.includes("–") || h1Text.includes("-");
    if (!hasDash) {
      diags.push({ code: "H1_MALFORMED", severity: "error", section: "h1", message: "H1 must contain ' — ' separator between name and exam title" });
    }
  }

  // Track which canonical sections we've seen (and their order)
  const seen = new Set<SectionKind>();
  let outOfOrder = false;
  let lastCanonIdx = -1;

  for (const s of sections) {
    const kind = headingToSectionKind(s.heading);
    if (!kind) {
      diags.push({ code: "EXTRA_SECTION", severity: "warning", section: "h1", message: `Unknown section "${s.heading}"` });
      continue;
    }
    if (seen.has(kind)) {
      diags.push({ code: "DUPLICATE_SECTION", severity: "error", section: kind, message: `Duplicate ## ${s.heading} section` });
      continue;
    }
    seen.add(kind);

    const canonIdx = CANONICAL_ORDER.indexOf(kind);
    if (canonIdx < lastCanonIdx) outOfOrder = true;
    lastCanonIdx = canonIdx;

    switch (kind) {
      case "school": {
        if (!s.body.trim()) {
          diags.push({ code: "SCHOOL_SECTION_MISSING", severity: "error", section: kind, message: "School Information section is empty" });
          break;
        }
        const hasBullets = /-\s+\*\*[^*]+\*\*/.test(s.body);
        const isPipeTable = /^\|.*\|/m.test(s.body);
        if (isPipeTable) {
          diags.push({ code: "SCHOOL_BULLET_FORMAT_WRONG", severity: "warning", section: kind, message: "School Information should use bullet points, not a table" });
        } else if (!hasBullets) {
          diags.push({ code: "SCHOOL_BULLETS_FLATTENED", severity: "warning", section: kind, message: "School Information bullets appear to be flattened onto one line" });
        }
        break;
      }
      case "student": {
        if (!s.body.trim()) {
          diags.push({ code: "STUDENT_SECTION_MISSING", severity: "error", section: kind, message: "Student Information section is empty" });
          break;
        }
        const rawTable = extractRawTable(s.body);
        if (!rawTable) {
          diags.push({ code: "STUDENT_TABLE_MALFORMED", severity: "error", section: kind, message: "Student Information must contain a pipe table" });
          break;
        }
        const presentRows = new Set(rawTable.rows.map((r) => {
          const cells = r.split("|").slice(1, -1).map((c) => c.trim().toLowerCase());
          return cells[0] || "";
        }));
        for (const required of REQUIRED_STUDENT_ROWS) {
          if (!presentRows.has(required)) {
            diags.push({ code: "STUDENT_FIELD_ROW_MISSING", severity: "error", section: kind, message: `Missing required student field: "${required}"` });
          }
        }
        break;
      }
      case "academic": {
        if (!s.body.trim()) {
          diags.push({ code: "ACADEMIC_SECTION_MISSING", severity: "error", section: kind, message: "Academic Performance section is empty" });
          break;
        }
        const tables = s.body.split(/\n\n+/).filter((b) => b.trim().startsWith("|"));
        if (tables.length === 0) {
          diags.push({ code: "ACADEMIC_TABLE_MISSING", severity: "error", section: kind, message: "No performance table found" });
          break;
        }
        if (tables.length > 1) {
          diags.push({ code: "ACADEMIC_MULTIPLE_TABLES", severity: "error", section: kind, message: "Found multiple tables; expected exactly one" });
          break;
        }
        const rawTable = extractRawTable(s.body);
        if (!rawTable || rawTable.rows.length === 0) {
          diags.push({ code: "ACADEMIC_NO_DATA_ROWS", severity: "error", section: kind, message: "Performance table has no data rows" });
          break;
        }
        const hdrs = rawTable.headerLine.split("|").slice(1, -1).map((c) => c.trim());
        if (hdrs.length < 2) {
          diags.push({ code: "ACADEMIC_FIRST_COLUMN_WRONG", severity: "error", section: kind, message: "Expected first column to be Subject Code" });
          break;
        }
        const firstCol = hdrs[0].toLowerCase();
        if (firstCol !== "subject code" && firstCol !== "subject" && firstCol !== "learning areas") {
          diags.push({ code: "ACADEMIC_FIRST_COLUMN_WRONG", severity: "error", section: kind, message: `Expected first column 'Subject Code', got '${hdrs[0]}'` });
        }

        const detectedCategory = detectCategoryFromBlock(s);
        let hasLoCol = false;
        for (let i = 1; i < hdrs.length; i++) {
          if (/^learning\s*outcomes?$/i.test(hdrs[i])) {
            hasLoCol = true;
          } else {
            const hasMax = /\(\d+\)/.test(hdrs[i]);
            if (!hasMax && detectedCategory !== "DAYCARE") {
              diags.push({ code: "ACADEMIC_HEADER_MISSING_MAX", severity: "warning", section: kind, message: `Column "${hdrs[i]}" missing (max) value` });
            }
          }
        }
        if (detectedCategory === "DAYCARE" && !hasLoCol) {
          diags.push({ code: "ACADEMIC_LO_COLUMN_REQUIRED", severity: "error", section: kind, message: "DAYCARE requires a Learning Outcome column" });
        }
        if (detectedCategory !== "DAYCARE" && hasLoCol) {
          diags.push({ code: "ACADEMIC_LO_COLUMN_UNEXPECTED", severity: "warning", section: kind, message: "Learning Outcome column found for non-DAYCARE category" });
        }
        break;
      }
      case "ratings": {
        if (!s.body.trim()) {
          diags.push({ code: "RATINGS_SECTION_MISSING", severity: "error", section: kind, message: "Missing ## Learner's Rating section" });
          break;
        }
        const rt = extractRawTable(s.body);
        if (!rt) {
          diags.push({ code: "RATINGS_TABLE_MALFORMED", severity: "error", section: kind, message: "Ratings must be a pipe table" });
        }
        break;
      }
      case "remark": {
        if (!s.body.trim()) {
          diags.push({ code: "REMARK_SECTION_MISSING", severity: "error", section: kind, message: "Missing ## Teacher's Remark section" });
          break;
        }
        if (!s.body.includes(">")) {
          diags.push({ code: "REMARK_BLOCKQUOTE_MISSING", severity: "error", section: kind, message: "Remark must use > blockquote" });
        }
        break;
      }
    }
  }

  // Missing sections
  for (const kind of CANONICAL_ORDER) {
    if (!seen.has(kind)) {
      diags.push({ code: `${kind.toUpperCase()}_SECTION_MISSING` as DiagnosticCode, severity: "error", section: kind, message: `Missing ## ${Object.entries(CANONICAL_HEADINGS).find(([, v]) => v === kind)?.[0]?.slice(3) ?? kind} section` });
    }
  }

  if (outOfOrder) {
    diags.push({ code: "SECTION_OUT_OF_ORDER", severity: "warning", section: "h1", message: "Sections are out of canonical order" });
  }

  return diags;
}

// ─── Fix rounds ──────────────────────────────────────────────────────────────

function fixRound1(blocks: DocBlock[], errors: StructureDiagnostic[], fixes: FixRecord[]) {
  // Fix 1.1: Insert missing H1
  const hasH1 = blocks.some((b) => b.type === "h1");
  if (!hasH1) {
    const name = "Unknown Student";
    const title = "Unknown Examination";
    blocks.unshift({ type: "h1", heading: `${name} — ${title}`, body: "", startLine: 0, endLine: 0 });
    fixes.push({ section: "h1", code: "H1_MISSING", description: `Inserted H1: ${name} — ${title}` });
  }

  // Fix 1.2: Remove extra H1s
  const h1Indices = blocks.reduce((acc, b, i) => { if (b.type === "h1") acc.push(i); return acc; }, [] as number[]);
  while (h1Indices.length > 1) {
    const idx = h1Indices.pop()!;
    blocks.splice(idx, 1);
    fixes.push({ section: "h1", code: "DUPLICATE_SECTION", description: "Removed duplicate H1" });
  }

  // Fix 1.3: Insert missing sections in canonical order
  for (const kind of CANONICAL_ORDER) {
    const hasSection = blocks.some((b) => b.type === "section" && headingToSectionKind(b.heading) === kind);
    if (!hasSection) {
      const headingKey = Object.entries(CANONICAL_HEADINGS).find(([, v]) => v === kind)?.[0];
      if (!headingKey) continue;
      const headingText = headingKey.slice(3);
      const lastSectionIdx = blocks.reduce((acc, b, i) => (b.type === "section" || b.type === "h1" ? i : acc), 0);
      const insertAt = lastSectionIdx + 1;
      blocks.splice(insertAt, 0, { type: "section", heading: headingText, body: "", startLine: 0, endLine: 0 });
      fixes.push({ section: kind, code: `${kind.toUpperCase()}_SECTION_MISSING` as DiagnosticCode, description: `Inserted empty ## ${headingText} section` });
    }
  }

  // Fix 1.4: Reorder sections to canonical order
  const sectionBlocks = blocks.filter((b) => b.type === "section");
  const sorted = [...sectionBlocks].sort((a, b) => {
    const ka = headingToSectionKind(a.heading);
    const kb = headingToSectionKind(b.heading);
    return CANONICAL_ORDER.indexOf(ka ?? "remark") - CANONICAL_ORDER.indexOf(kb ?? "remark");
  });
  let changed = false;
  for (let i = 0; i < sectionBlocks.length; i++) {
    if (sectionBlocks[i] !== sorted[i]) { changed = true; break; }
  }
  if (changed) {
    const h1 = blocks.find((b) => b.type === "h1");
    const rest = blocks.filter((b) => b.type !== "h1");
    const reordered = [];
    for (const kind of CANONICAL_ORDER) {
      const candidate = sorted.find((b) => headingToSectionKind(b.heading) === kind);
      if (candidate) reordered.push(candidate);
    }
    blocks.length = 0;
    if (h1) blocks.push(h1);
    blocks.push(...reordered);
    fixes.push({ section: "h1", code: "SECTION_OUT_OF_ORDER", description: "Reordered sections to canonical order" });
  }
}

function fixRound2(blocks: DocBlock[], errors: StructureDiagnostic[], fixes: FixRecord[]) {
  // Fix 2.1: Reconstruct malformed H1
  const h1Block = blocks.find((b) => b.type === "h1");
  if (h1Block) {
    const hasDash = h1Block.heading?.includes("—") || h1Block.heading?.includes("–") || h1Block.heading?.includes("-");
    const studentSection = blocks.find((b) => headingToSectionKind(b.heading) === "student");
    if (!hasDash && studentSection) {
      let studentName = "";
      const nameM = studentSection.body.match(/\|\s*full\s*name\s*\|\s*(.+?)\s*\|/i);
      if (nameM) studentName = nameM[1].replace(/<[^>]*>/g, "").replace(/^@/, "").trim();
      let examTitle = "";
      const termM = studentSection.body.match(/\|\s*term\s*\|\s*(.+?)\s*\|/i);
      if (termM) examTitle = termM[1].replace(/<[^>]*>/g, "").replace(/^@/, "").trim();
      if (studentName && examTitle) {
        h1Block.heading = `${studentName} — ${examTitle}`;
        h1Block.body = "";
        fixes.push({ section: "h1", code: "H1_MALFORMED", description: `Reconstructed H1 as: ${studentName} — ${examTitle}` });
      }
    }
  }
}

function fixRound3(blocks: DocBlock[], errors: StructureDiagnostic[], fixes: FixRecord[]) {
  // Fix 3.1: Turn flattened school info back into bullets
  const schoolBlock = blocks.find((b) => headingToSectionKind(b.heading) === "school");
  if (schoolBlock && schoolBlock.body.trim()) {
    const hasBullets = /-\s+\*\*[^*]+\*\*/.test(schoolBlock.body);
    const isPipeTable = /^\|.*\|/m.test(schoolBlock.body);
    if (!hasBullets && !isPipeTable) {
      const lines = schoolBlock.body.split("\n").filter((l) => l.trim());
      if (lines.length === 1 && lines[0].includes(",")) {
        const parts = lines[0].split(",").map((p) => p.trim());
        const reconstructed = parts.map((p) => {
          const colonIdx = p.indexOf(":");
          if (colonIdx > 0) {
            const key = p.slice(0, colonIdx).trim();
            const val = p.slice(colonIdx + 1).trim();
            return `- **${key}:** ${val}`;
          }
          return `- ${p}`;
        }).join("\n");
        schoolBlock.body = reconstructed;
        fixes.push({ section: "school", code: "SCHOOL_BULLETS_FLATTENED", description: "Reconstructed flattened school info" });
      }
    }
  }
}

function fixRound4(blocks: DocBlock[], errors: StructureDiagnostic[], fixes: FixRecord[]) {
  // Fix 4.1: Add missing blockquote to remark
  const remarkBlock = blocks.find((b) => headingToSectionKind(b.heading) === "remark");
  if (remarkBlock && remarkBlock.body.trim() && !remarkBlock.body.includes(">")) {
    remarkBlock.body = `> ${remarkBlock.body}`;
    fixes.push({ section: "remark", code: "REMARK_BLOCKQUOTE_MISSING", description: "Wrapped remark in blockquote" });
  }

  // Fix 4.2: Restore table separator rows if missing
  for (const block of blocks) {
    if (block.type !== "section") continue;
    const kind = headingToSectionKind(block.heading);
    if (!kind || kind === "school") continue;
    const rawTable = extractRawTable(block.body);
    if (!rawTable) continue;
    const lines = block.body.split("\n");
    const sepIndex = rawTable.headerIndex + 1;
    if (sepIndex < lines.length && !/^\|[\s:]*-+[\s:]*\|/.test(lines[sepIndex])) {
      const hdrCells = rawTable.headerLine.split("|").slice(1, -1);
      const sep = "| " + hdrCells.map(() => "---").join(" | ") + " |";
      lines.splice(sepIndex, 0, sep);
      block.body = lines.join("\n");
      fixes.push({ section: kind, code: "STUDENT_TABLE_MALFORMED", description: `Added missing separator row to ${kind} table` });
    }
  }
}

export function autoFixStructure(md: string, context?: ParseContext): AutoFixResult {
  const blocks = splitDocument(md);
  let diags = diagnoseStructure(blocks);
  const fixes: FixRecord[] = [];

  const errors = diags.filter((d) => d.severity === "error");
  if (errors.length === 0) {
    const parsed = parseMarksheetMarkdown(md, context);
    return { fixedMd: md, fixes: [], unresolved: [], parsed };
  }

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

  const fixedMd = joinBlocks(blocks);
  const finalDiags = diagnoseStructure(blocks);
  const parsed = parseMarksheetMarkdown(fixedMd, context);

  return {
    fixedMd,
    fixes,
    unresolved: finalDiags.filter((d) => d.severity === "error"),
    parsed,
  };
}

// ─── Markdown Generator ───────────────────────────────────────────────────────

function escMd(val: string): string {
  return val.replace(/\|/g, '\\|');
}

export function extractTableField(md: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\|\\s*${escapedLabel}\\s*\\|\\s*(.+?)\\s*\\|`, 'i');
  const m = re.exec(md);
  return m ? m[1].trim() : null;
}

export function generateMarksheetMarkdown(m: Marksheet): string {
  const lines: string[] = [];

  // H1 heading
  const h1Title = m.student.title ? `${m.student.fullName} \u2014 ${m.student.title}` : m.student.fullName;
  lines.push(`# ${h1Title}`, '');

  // Student Information
  lines.push('## Student Information', '');
  lines.push('| Field | Details |');
  lines.push('| --- | --- |');
  const studentFields: [string, string][] = [
    ['Full Name', m.student.fullName],
    ['Admission No', String(m.student.adminNo)],
    ['Class', m.student.className],
    ['Section', m.student.sectionName],
    ['Category', m.student.category],
    ['Term', m.student.term],
    ['Academic Year', m.student.sessionYear],
    ['Days Open', String(m.student.daysOpened)],
    ['Days Present', String(m.student.daysPresent)],
    ['Days Absent', String(m.student.daysAbsent)],
  ];
  for (const [label, val] of studentFields) {
    lines.push(`| ${escMd(label)} | ${escMd(val)} |`);
  }
  lines.push('');

  // Academic Performance
  lines.push('## Academic Performance', '');
  const hasTitles = m.records[0]?.titles?.length > 0;

  if (!hasTitles) {
    lines.push('| Subject Code | Learning Outcome |');
    lines.push('| --- | --- |');
    for (const rec of m.records) {
      const lo = rec.learningOutcome ?? '';
      lines.push(`| ${escMd(rec.subjectCode)} | ${escMd(lo)} |`);
    }
  } else {
    const titles = m.records[0]?.titles ?? [];
    const fullMarks = m.records[0]?.fullMarks ?? [];
    const headerCells = ['Subject Code'];
    for (let i = 0; i < titles.length; i++) {
      const maxStr = fullMarks[i] != null && fullMarks[i] > 0 ? ` (${fullMarks[i]})` : '';
      headerCells.push(`${escMd(titles[i])}${maxStr}`);
    }
    lines.push(`| ${headerCells.join(' | ')} |`);
    lines.push(`| ${headerCells.map(() => '---').join(' | ')} |`);
    for (const rec of m.records) {
      const rowCells = [escMd(rec.subjectCode)];
      for (let i = 0; i < titles.length; i++) {
        rowCells.push(String(rec.marks[i] ?? ''));
      }
      lines.push(`| ${rowCells.join(' | ')} |`);
    }
  }
  lines.push('');

  // Learner's Rating
  if (m.ratings && m.ratings.length > 0) {
    lines.push("## Learner's Rating", '');
    lines.push('| Trait | Rating |');
    lines.push('| --- | --- |');
    for (const r of m.ratings) {
      const attr = r.attribute ?? '';
      const rate = r.rate != null ? String(r.rate) : '';
      lines.push(`| ${escMd(attr)} | ${rate} |`);
    }
    lines.push('');
  }

  // Teacher's Remark
  if (m.remark?.remark) {
    lines.push("## Teacher's Remark", '');
    lines.push(`> ${m.remark.remark}`);
  }

  return lines.join('\n');
}
