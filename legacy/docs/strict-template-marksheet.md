# marksheet-markdown-strict-template

The document agent must emit markdown following this exact structure. The parser reads it with zero LLM calls at validate time. An auto-fix pipeline (`autoFixStructure`) runs in the browser after streaming ends to correct common structural errors before the editor opens — also pure TS, zero LLM.

**School Information**, **Gender**, and **Session Year** are NOT emitted by the agent — they are injected by `validate-marksheet.ts` from the database before Zod validation. The agent injects tenant context (class roster, subject mapping, exam/academic IDs) so it can generate `@mention` spans for Full Name, Term, and Academic Year.

## Structure

```
# Student Full Name — Exam Title

## Student Information
| Field | Details |
|---|---|
| Full Name | <span data-type="mention" data-id="{studentId}" data-category="students" data-admission-no="{admNo}" data-student-name="NAME">@NAME</span> |
| Admission No | <span data-type="mention" data-id="{studentId}" data-category="students" data-admission-no="{admNo}" data-student-name="NAME">@ADM{admNo}</span> |
| Class | <span data-type="mention" data-id="{classId}" data-category="class" data-label="{className}">@CLASS</span> |
| Section | <span data-type="mention" data-id="{sectionId}" data-category="section" data-label="{sectionName}">@SECTION</span> |
| Category | {CATEGORY} |
| Term | <span data-type="mention" data-id="{examId}" data-category="exam" data-label="TERM">@TERM</span> |
| Academic Year | <span data-type="mention" data-id="{acadId}" data-category="academic_year" data-label="YEAR">@YEAR</span> |
| Days Open | {n} |
| Days Present | {n} |
| Days Absent | {n} |

---

## Academic Performance

| Subject Code | Title1 (max) | Title2 (max) | ... | Learning Outcome |
|---|---|---|---|---|
| SUBJECT1 | mark | mark | ... | outcome text |
| SUBJECT2 | mark | mark | ... | outcome text |

---

## Learner's Rating
| Trait | Rating |
|---|---|
| Adherent and independent | 1-5 |
| Flexibility and creativity | 1-5 |
| Meticulous | 1-5 |
| Neatness | 1-5 |
| Self-control and interaction | 1-5 |
| Overall progress | 1-5 |

---

## Teacher's Remark

> Teacher's comment text.
```

## Section Details

### H1 Title
`# FullName — ExamTitle`
Parser extracts `student.fullName` and `student.title` from the two sides of `—`.
Auto-fix: reconstructs a valid `# Name — Title` if the separator is missing or malformed.

### School Information (injected, not emitted)
School Information section (Name, Email, Phone, City, State, Title, Vacation Date) is NOT emitted by the document agent. `validate-marksheet.ts` injects it from `smSchools` DB before Zod validation. Fields not available in DB (`city`, `state`, `title`, `vacation_date`) default to empty strings via the parser.

### Student Information (table)
Uses HTML `<span data-type="mention">` tags for entities that have server-side IDs. The parser extracts:
- `data-category="students"` → `studentId`
- `data-category="exam"` → `examTypeId`
- `data-category="academic_year"` → `academicId`
- `data-admission-no` → `admissionNo`
- `data-student-name` → `studentName`

Plain text fields (Admission No, Class, Section, Category, Days fields) are read directly from table cells.
**Gender** and **Session Year** are NOT emitted — `validate-marksheet.ts` injects them from DB (gender from `smStudents`, sessionYear from `studentRecords`).
Auto-fix: converts bullet-list student info to pipe table format.

### Academic Performance (single table)
Subjects are **rows**, assessments are **columns**. Rules:

1. **First column** must be `Subject Code`
2. **Assessment columns** use `Title (Max)` format — e.g. `CA (30)`, `EXAM (50)`, `MTA (30)`. Auto-fix appends `(max)` for known titles using `EXAM_MARK_MAXIMUMS` lookup (see aliasing table below); `H/W` is normalized to `HW` for matching.
3. **Learning Outcome column** — optional, detected by header matching `/^learning\s*outcome$/i`. Required for DAYCARE. Ignored for other categories. Auto-fix renames a 2-column table's second header to `Learning Outcome` if missing, or shifts the last non-numeric column for 3+ column tables.
4. **Row values**: subject code in column 0, marks in assessment columns, learning outcome text in the last column
5. **No metadata rows** (no Total, Grade rows — these are computed during validation)

#### Auto-fix: assessment title aliasing

When `(max)` is missing from a column header, `autoFixStructure` looks up the title in this reverse lookup (built from `EXAM_MARK_MAXIMUMS`). Titles are normalized by stripping whitespace, hyphens, and slashes:

| Input header | Normalized | Resolves to |
|---|---|---|
| `CA` | `CA` | (depends on category) |
| `ORAL` | `ORAL` | 5 |
| `PSYCHO` | `PSYCHO` | 5 |
| `HW` | `HW` | 10 |
| `H/W` | `HW` (slash stripped) | 10 |
| `HOMEWORK` | `HOMEWORK` | 10 |
| `EXAM` | `EXAM` | 50 |

#### Column sets per category

| Category | Columns |
|---|---|
| **DAYCARE** | `Subject Code \| Learning Outcome` |
| **NURSERY** | `Subject Code \| CA (30) \| ORAL (5) \| PSYCHO (5) \| HW (10) \| EXAM (50)` |
| **GRADEK** | `Subject Code \| CA1 (20) \| CA2 (20) \| HW (2) \| REPORT (4) \| PSYCHO (4) \| EXAM (50)` |
| **LOWERBASIC** | `Subject Code \| MTA (30) \| CA (10) \| REPORT (10) \| EXAM (50)` |
| **MIDDLEBASIC** | `Subject Code \| MTA (30) \| CA (10) \| REPORT (10) \| EXAM (50)` |
| **CRECHE** (mapped to DAYCARE) | May include assessment columns with LO — auto-fix handles mixed layouts. |

### Learner's Rating (table)
Two columns: `Trait \| Rating`. Rating values 1-5. Traits are fixed (Adherent and independent, Flexibility and creativity, Meticulous, Neatness, Self-control and interaction, Overall progress).
Auto-fix: converts bullet-list ratings to pipe table format.

### Teacher's Remark (blockquote)
```
> remark text
```
Single blockquote or multiple lines joined into one string.
Auto-fix: wraps bare text in a blockquote.

## Auto-Fix Pipeline

After the streaming agent finishes writing the markdown, `autoFixStructure(md)` runs in the browser before the editor opens. It operates in four linear rounds, re-diagnosing between each:

### Round 1 — Document-level cleanup
- Remove extra sections beyond the five canonical ones
- Deduplicate repeated sections
- Reorder sections into canonical order: School → Student → Academic → Ratings → Remark
- Reconstruct malformed H1

### Round 2 — Section format fixes
- School: pipe table → bullets; plain bullets → bold bullets; **flattened** bullets (multiple fields on one line) → one bullet per field
- Student: bullet list → pipe table
- Ratings: bullet list → pipe table
- Remark: wrap bare text in `>` blockquote

### Round 3 — Academic table structure
- Merge multiple tables into one
- Rename first column to `Subject Code`
- Add `(max)` suffix to known assessment headers
- Rename/detect Learning Outcome column
- Add missing Learning Outcome column for DAYCARE/CRECHE categories

### Round 4 — Structural re-check
- Re-run detailed diagnosis (row count, required student fields)
- Remaining errors are dropped as `unresolved`

### What is fixable (~95% of cases)
- Malformed H1, school pipe table, student bullets, missing `(max)`, remark without blockquote, section reorder, multiple tables merged, extra sections removed, LO column missing, duplicate sections

### What is NOT fixable (→ agent fallback or user fix)
- Missing H1 (`H1_MISSING`), student section missing, academic table missing with zero data rows (`TABLE_MISSING`, `NO_DATA_ROWS`)
- `SCHOOL_SECTION_MISSING` is a **warning** only (school is injected by validation) — does not block the pipeline
- Data-level validation errors (zod) — these are surfaced to the user as editor hints

## Context Injection & @mention Generation

The `stream-document.ts` tool injects these context blocks before the OCR input:

- **CLASS ROSTER**: Active students for the tenant's class/section/academic year, with admission numbers and IDs
- **SUBJECT MAPPING**: `subjectCode → subjectId` for all subjects linked to the tenant
- **examTypeTitle, academicYearTitle, className, sectionName**: Display labels from the tenant context

The agent uses these to generate `@mention` spans for:
- **Full Name** → `<span data-type="mention" data-id="{studentId}" data-category="students" data-admission-no="{admNo}" data-student-name="{name}">@NAME</span>`
- **Admission No** → `<span data-type="mention" data-id="{studentId}" data-category="students" data-admission-no="{admNo}" data-student-name="{name}">@ADM{admNo}</span>`
- **Term** → `<span data-type="mention" data-id="{examTypeId}" data-category="exam" data-label="{title}">@TERM</span>`
- **Academic Year** → `<span data-type="mention" data-id="{academicId}" data-category="academic_year" data-label="{title}">@YEAR</span>`
- **Class** → `<span data-type="mention" data-id="{classId}" data-category="class" data-label="{className}">@CLASS</span>`
- **Section** → `<span data-type="mention" data-id="{sectionId}" data-category="section" data-label="{sectionName}">@SECTION</span>`

## Real Examples

### DAYCARE (two-column, no assessments)

```markdown
# SHEKUMA TULE — FIRST TERM EXAMINATION DEC/2025

## Academic Performance

| Subject Code | Learning Outcome |
|---|---|
| BIBLE | Shows growing interest in Bible time. |
| CLL/JP | Listens attentively to songs and rhymes. |
| KUW/EAD | Shows curiosity about the environment. |
| PSED/PD | Enjoys playing willingly near other children. |
| PSRN | Attempts to solve simple challenges. |
```

### NURSERY (five assessments + optional Learning Outcome)

```markdown
# JOSEPH OLOCHE GABRIEL — FIRST TERM EXAMINATION DEC/2025

## Academic Performance

| Subject Code | CA (30) | ORAL (5) | PSYCHO (5) | HW (10) | EXAM (50) |
|---|---|---|---|---|---|
| BIBLE | 30 | 5 | 5 | 10 | 44 |
| CLL/JP | 24 | 5 | 5 | 10 | 46 |
| KUW/EAD | 30 | 5 | 5 | 10 | 43 |
| PSED/PD | 30 | 5 | 5 | 10 | 44 |
| PSRN | 28 | 5 | 5 | 10 | 38 |
```

### GRADEK (six assessments)

```markdown
# DEBORAH AYOSOORE OLUWADARE — FIRST TERM EXAMINATION DEC/2025

## Academic Performance

| Subject Code | CA1 (20) | CA2 (20) | HW (2) | REPORT (4) | PSYCHO (4) | EXAM (50) |
|---|---|---|---|---|---|---|
| BIBLE | 20 | 20 | 2 | 4 | 4 | 50 |
| PSRN/QR | 20 | 20 | 2 | 4 | 4 | 48 |
| JP/LIT | 18 | 20 | 2 | 4 | 4 | 39 |
| CL/VR | 20 | 15 | 2 | 4 | 4 | 50 |
| PSED/PD | 20 | 20 | 2 | 4 | 4 | 50 |
| KUW/EAD | 19 | 18 | 2 | 4 | 4 | 48 |
```

### LOWERBASIC / MIDDLEBASIC (four assessments)

```markdown
# DAVID OLUWADARE — FIRST TERM EXAMINATION DEC/2025

## Academic Performance

| Subject Code | MTA (30) | CA (10) | REPORT (10) | EXAM (50) |
|---|---|---|---|---|
| MATH | 18 | 8 | 10 | 57 |
| ENG | 23 | 8 | 10 | 49 |
| CCA | 22 | 10 | 10 | 44 |
| CRS | 29 | 10 | 10 | 42 |
| BASIC SCIENCE | 30 | 10 | 10 | 31 |
| ICT | 20 | 10 | 10 | 38 |
| PHE | 30 | 10 | 10 | 49 |
| CIVIC | 25 | 10 | 10 | 36 |
```

### CRECHE (mapped to DAYCARE, assessments + Learning Outcome)

```markdown
# RYAN ADAKOLE EMMANUEL — SECOND TERM EXAMINATION - MCH/2026

## Academic Performance

| Subject Code | H/W (10) | CA (30) | Psycho (5) | Oral (5) | Exam (50) | Learning Outcome |
|---|---|---|---|---|---|---|
| BIBLE | 10 | 30 | 5 | 5 | 50 | Identifies biblical characters and stories |
| CLL/JP | 10 | 24 | 5 | 5 | 50 | Recognizes letters and sounds |
| KUW/EAD | 10 | 30 | 5 | 5 | 45 | Understands basic values and social skills |
| PSED/PD | 10 | 30 | 5 | 5 | 50 | Demonstrates physical coordination and creativity |
| PSRN | 10 | 24 | 5 | 5 | 36 | Counts and recognizes numbers 1-10 |
```
