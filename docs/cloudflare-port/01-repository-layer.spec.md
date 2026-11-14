# 01 — Repository Layer Specification

Target design for the data-access layer of the EdApex Hono API on Cloudflare Workers with D1. This document defines structure and contracts; [01b](./01b-repository-migration-map.md) maps every existing method onto it, and [01a](./01a-d1-optimization.playbook.md) defines the platform rules it must obey.

---

## 1. Scope

### 1.1 What the repository layer owns

Data access only: query construction, row→DTO mapping, and the transaction/batch boundary. It does **not** own business rules, orchestration, caching policy, or HTTP concerns.

### 1.2 Measured size of the current layer

| Repository | Lines | Async methods |
|---|---|---|
| `result.repo.ts` | 960 | 32 |
| `student.repo.ts` | 1,275 | 26 |
| `staff.repo.ts` | 401 | 12 |
| `auth.repo.ts` | 157 | 12 |
| `timeline.repo.ts` | 110 | 8 |
| `parent.repo.ts` | 160 | 6 |
| `base.repo.ts` | 236 | 9 |
| `assignment.repo.ts` | 151 | 2 |
| `school.repo.ts` | 24 | 1 |
| **Total** | **3,511** | **108** |

Method counts come from `scripts/gen-migration-map.mjs`, which matches `async <name>(` declarations. An earlier grep that also matched indented call expressions inflated these to 540; the per-method inventory in [01b](./01b-repository-migration-map.md) is authoritative.

Counts include private helpers, not just public API surface.

### 1.3 Port surface — 62 legacy tables

49 cataloged tables + 13 FK-closure tables. See [schema-catalog.md](./schema-catalog.md) for keys, relations, and rationale per table. Tables introduced by the redesign are specified in [04](./04-auth-identity.spec.md), [05](./05-d1-migration.spec.md), and [06](./06-archive-and-retrieval.spec.md); they are not ported from MySQL.

The 13 closure tables exist because D1 enforces foreign keys unconditionally. They are created and seeded but have **no repositories** until a feature needs them.

### 1.4 Two-stage migration

| Stage | Work | Safety net |
|---|---|---|
| **1 — Dialect** | Port queries from MySQL to D1 preserving current structure and behaviour. | Existing behaviour pinned by parity tests; files placed at their final paths where it costs nothing. |
| **2 — Structure** | Move methods into the target tree, split oversized files, delete cross-concern code. | Stage 1's parity tests must stay green throughout. |

Doing both at once makes a D1 bug and a refactor bug indistinguishable. The target tree is fixed now so Stage 1 does not create work that Stage 2 immediately deletes.

---

## 2. Runtime contract

### 2.1 Bindings

```jsonc
// wrangler.jsonc
{
  "compatibility_date": "2026-11-03",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    { "binding": "DB", "database_name": "edapex", "database_id": "<id>" }
  ]
}
```

Secrets (session pepper, OAuth client secrets, email API key) arrive as Worker secrets, never in `vars`.

### 2.2 Client lifecycle

```ts
// per request — built in middleware, never module-level
const db = drizzle(c.env.DB, { schema });
```

Rules:

- **No module-level database singleton.** Workers reuse isolates across requests; a cached connection is shared state with a lifetime nobody controls.
- **No connection pool.** D1 manages connections server-side.
- **No client in a repository constructor default.** The client is injected via `RepositoryContext`.

### 2.3 What replaces what

| Current | Replacement | Reason |
|---|---|---|
| `mysql2/promise` pool ([db/index.ts](../../src/lib/server/db/index.ts)) | `drizzle(env.DB)` per request | D1 is an HTTP-backed binding; no TCP pool exists |
| `$env/dynamic/private` | `c.env` (Hono context) | No SvelteKit runtime on Workers |
| Module-global `dbInstancePromise` | deleted | Cross-request shared state |
| `db.transaction(async tx => …)` | `db.batch([...])` | D1 rejects `BEGIN`; batch is atomic |
| `new Date().toISOString().slice(0,19).replace("T"," ")` | one date encoding, schema-wide | SQLite compares text lexicographically |

### 2.4 Request lifecycle

```text
request
  → tenant middleware resolves {schoolId, userId, staffId, designationId, roleId, academicId, classId, sectionId}
  → RepositoryContext { db, tenant, config } created
  → route handler calls a repository through the scoped provider
  → response; context is garbage-collected with the request
```

Un-resolvable tenant (login, magic link, code redemption) uses the **unscoped** path in §6.3 — never a fallback tenant.

---

## 3. Target architecture

### 3.1 Tree

```text
src/lib/server/repository/
  base/
    repository-context.ts     // db + tenant + config, frozen
    error-handling.ts         // withErrorHandling, error taxonomy re-export
    d1-helpers.ts             // chunkedInArray, chunkedInsert, batchOrThrow
    filters.ts                // optionalFilters
    pagination.ts             // keyset cursor contract
    index.ts
  accounts/
    user.repo.ts              // users
    role.repo.ts              // infix_roles
    session.repo.ts           // auth_sessions (new table; the legacy session store is not ported)
    auth.repo.ts              // credential claim, linking (unscoped)
    index.ts
  profiles/
    student/
      profile.repo.ts         // sm_students
      records.repo.ts         // student_records
      lifecycle.repo.ts       // sm_student_promotions (promote/demote/assign)
      search.repo.ts          // search, by-staff, siblings
      index.ts
    staff/profile.repo.ts     // sm_staffs
    parent/profile.repo.ts    // sm_parents
    index.ts
  reference/
    base-setup.repo.ts        // sm_base_groups, sm_base_setups
    designation.repo.ts       // sm_designations
    department.repo.ts        // sm_human_departments
    student-category.repo.ts  // sm_student_categories
    locale.repo.ts            // sm_languages, languages, sm_date_formats
    index.ts
  campus/
    transport.repo.ts         // sm_routes, sm_vehicles
    hostel.repo.ts            // sm_dormitory_lists, sm_room_lists
    student-group.repo.ts     // sm_student_groups
    index.ts
  academics/
    class.repo.ts             // sm_classes
    section.repo.ts           // sm_sections
    subject.repo.ts           // sm_subjects
    assignment.repo.ts        // sm_assign_subjects, sm_assign_class_teachers, sm_class_teachers
    class-section.repo.ts     // sm_class_sections
    timetable.repo.ts         // sm_class_routines, sm_class_routine_updates
    timetable-resource.repo.ts// sm_class_times, sm_class_rooms, sm_room_types
    index.ts
  assessments/
    exam.repo.ts              // sm_exams, sm_exam_types, sm_exam_schedules
    exam-setup.repo.ts        // sm_exam_setups
    marks.repo.ts             // sm_mark_stores
    results.repo.ts           // sm_result_stores, sm_marks_grades
    merit.repo.ts             // exam_merit_positions
    feedback.repo.ts          // teacher_remarks, student_ratings
    homework.repo.ts          // sm_homeworks, sm_homework_students
    index.ts
  attendance/
    student-attendance.repo.ts // sm_student_attendances
    class-attendance.repo.ts   // class_attendances
    index.ts
  fees/
    fees-group.repo.ts        // sm_fees_groups, sm_fees_types
    fees-master.repo.ts       // sm_fees_masters, sm_fees_discounts
    fees-assign.repo.ts       // sm_fees_assigns
    fees-payment.repo.ts      // sm_fees_payments, sm_bank_accounts
    index.ts
  school/
    school.repo.ts            // sm_schools
    settings.repo.ts          // sm_general_settings
    academic-year.repo.ts     // sm_academic_years
    index.ts
  communications/
    chat-group.repo.ts        // chat_groups, chat_group_users
    calendar.repo.ts          // sm_events, sm_holidays
    notice.repo.ts            // sm_notice_boards
    index.ts
  index.ts                    // barrel: types + classes only
```

### 3.2 Aggregate → table mapping

Every one of the 62 legacy tables appears exactly once.

| Folder | # | Tables |
|---|---|---|
| `accounts/` | 2 | `users`, `infix_roles` |
| `profiles/student/` | 4 | `sm_students`, `student_records`, `sm_student_promotions`, `sm_student_timelines` |
| `profiles/staff/` | 1 | `sm_staffs` |
| `profiles/parent/` | 1 | `sm_parents` |
| `reference/` | 8 | `sm_base_groups`, `sm_base_setups`, `sm_designations`, `sm_human_departments`, `sm_student_categories`, `sm_languages`, `languages`, `sm_date_formats` |
| `campus/` | 5 | `sm_routes`, `sm_vehicles`, `sm_dormitory_lists`, `sm_room_lists`, `sm_student_groups` |
| `academics/` | 12 | `sm_classes`, `sm_sections`, `sm_subjects`, `sm_assign_subjects`, `sm_class_sections`, `sm_class_teachers`, `sm_assign_class_teachers`, `sm_class_routines`, `sm_class_routine_updates`, `sm_class_times`, `sm_class_rooms`, `sm_room_types` |
| `assessments/` | 12 | `sm_exams`, `sm_exam_types`, `sm_exam_setups`, `sm_exam_schedules`, `sm_mark_stores`, `sm_result_stores`, `sm_marks_grades`, `exam_merit_positions`, `teacher_remarks`, `student_ratings`, `sm_homeworks`, `sm_homework_students` |
| `attendance/` | 2 | `sm_student_attendances`, `class_attendances` |
| `fees/` | 7 | `sm_fees_groups`, `sm_fees_types`, `sm_fees_masters`, `sm_fees_assigns`, `sm_fees_payments`, `sm_fees_discounts`, `sm_bank_accounts` |
| `school/` | 3 | `sm_schools`, `sm_general_settings`, `sm_academic_years` |
| `communications/` | 5 | `chat_groups`, `chat_group_users`, `sm_events`, `sm_holidays`, `sm_notice_boards` |
| **Total** | **62** | |

### 3.3 Why `accounts/` and `profiles/` are siblings

Rejected alternative: `users/{student,staff,parent}`.

- A parent is **not a user subtype**. `sm_parents.id` is its own key that merely references `users.id`; nesting asserts an inheritance the schema does not have.
- `accounts/` is the only **cross-tenant, pre-tenant** path. Login and code redemption happen before a tenant is known. Colocating it with tenant-scoped profile repos is exactly the mixing this redesign removes.
- Student alone is 1,275 lines across 26 async methods; burying it two levels down hurts discoverability.

The relationship is already expressed by the FK graph (`profiles.*.user_id → accounts.users.id`), so folder nesting adds no information.

---

## 4. Separation rules

Each rule names the concrete code it changes and how compliance is checked. A pull request that breaks a rule must state which one and why.

| Rule | Statement | Current violation | Enforced by |
|---|---|---|---|
| **R1** | One aggregate per folder; a repository touches only tables in its aggregate (mapping in §3.2). | `result.repo.ts` writes attendance ([result.repo.ts:168](../../src/lib/server/repository/result.repo.ts#L168)) and owns subject assignment ([result.repo.ts:29](../../src/lib/server/repository/result.repo.ts#L29)) | Import-boundary test: a repo may import only its own aggregate's tables |
| **R2** | Repositories do data access. Orchestration and multi-aggregate workflows live in services. | Student promotion embeds chat-group cleanup ([student.repo.ts:990](../../src/lib/server/repository/student.repo.ts#L990) enclosing the delete at [~1091](../../src/lib/server/repository/student.repo.ts#L1091)) | `student-lifecycle.service.ts` owns the flow; the repo exposes primitives |
| **R3** | No caching inside repositories. Cached configuration is a separate module. | `ConfigurationCache`, `findActiveAcademicYear`, `getExamTypes`, `getCurrentTerm` all live in the base class ([base.repo.ts:58](../../src/lib/server/repository/base.repo.ts#L58)–[205](../../src/lib/server/repository/base.repo.ts#L205)) | `services/context` owns the per-request cache; `services/settings/academic.service` fills it |
| **R4** | No `any`, no `as any`, no `as` casts to silence errors. Explicit return types on every exported method. | **7 occurrences:** [base.repo.ts:48](../../src/lib/server/repository/base.repo.ts#L48), [base.repo.ts:49](../../src/lib/server/repository/base.repo.ts#L49), [auth.repo.ts:18](../../src/lib/server/repository/auth.repo.ts#L18), [auth.repo.ts:144](../../src/lib/server/repository/auth.repo.ts#L144), [result.repo.ts:135](../../src/lib/server/repository/result.repo.ts#L135), [student.repo.ts:371](../../src/lib/server/repository/student.repo.ts#L371), [student.repo.ts:907](../../src/lib/server/repository/student.repo.ts#L907) | `svelte-check` plus a lint rule banning `any` in this tree |
| **R5** | Every query is tenant-scoped. `school_id` comes from `RepositoryContext`, never a module global or a default argument. | `BaseRepository.build()` falls back to `schoolId: 1` ([base.repo.ts:43](../../src/lib/server/repository/base.repo.ts#L43)) | Tenant-isolation test per repository (§10) |
| **R6** | No `db.transaction()`. Multi-statement writes go through `batchOrThrow()`. | 5 sites (§8) | `grep -c 'db.transaction('` must be 0 |
| **R7** | Soft cap ~300 lines per file. Exceeding it means the aggregate is wrong. | `student.repo.ts` 1,275 lines; `result.repo.ts` 960 | Review; the tree in §3.1 already splits both |
| **R8** | Every repository is exported from its folder barrel **and** the root barrel. | `assignment.repo.ts` is reachable only by deep import | Barrel test: every `*.repo.ts` appears in the root barrel |
| **R9** | Cross-aggregate reads go through an explicit query module, never by importing another aggregate's repository. | `result.repo.ts` imports student and category concerns directly | Import-boundary test |

### 4.1 Rule precedence

R5 (tenant scoping) and R6 (no transactions) are correctness rules and cannot be waived. R7 is a heuristic; a documented exception is acceptable. R1–R3 may be waived for a single release with a written migration note.

---

## 5. `BaseRepository` redesign

Today `BaseRepository` is three things at once: connection plumbing, a configuration cache, and a grab-bag of domain queries. Only the first survives.

| Current member | Destination | Note |
|---|---|---|
| `constructor(db, tenant, provider)` | `RepositoryContext { db, tenant, config }` | Frozen, request-scoped |
| `static build()` with `schoolId: 1` fallback | **deleted** | A default tenant is a security bug that fails open |
| `create<T>({ table: any; values: T })` | `base/typed-insert.ts` | Typed on `SQLiteTable` + `$inferInsert` |
| `findActiveAcademicYear` | `school/academic-config.ts` | Domain logic, not plumbing |
| `loadConfigurations` | `school/academic-config.ts` | Request-scoped cache |
| `getGeneralSettings`, `getGeneralSettingBySchoolId` | `school/settings.repo.ts` | |
| `getAcademicYears`, `getActiveAcademicYear`, `getAcademicYearById`, `getAcademicId` | `school/academic-year.repo.ts` | |
| `getExamTypes`, `getCurrentTerm` | `assessments/exam.repo.ts` | |
| `withErrorHandling` | `base/error-handling.ts` | Kept, tightened |
| `optionalFilters` | `base/filters.ts` | Kept |

Result: `BaseRepository` as a class disappears. Consumers receive a `RepositoryContext` and call plain functions or thin classes. A thin wrapper may be retained for migration ergonomics, but it must not carry domain logic.

### 5.1 Typed insert

```ts
import type { InferInsertModel, SQLiteTable } from "drizzle-orm";

export async function insertOne<TTable extends SQLiteTable>(
  db: DrizzleD1Database,
  table: TTable,
  values: InferInsertModel<TTable>
): Promise<void> {
  await db.insert(table).values(values);
}
```

The old signature accepted `{ table: any; values: any }`, which meant a misspelled table produced a runtime error instead of a compile error.

---

## 6. Tenancy and the accounts boundary

### 6.1 Tenant context

```ts
interface TenantContext {
  readonly schoolId: number;
  readonly userId: number | null;
  readonly staffId: number | null;
  readonly designationId: number | null;
  readonly roleId: number | null;
  readonly academicId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
}
```

Resolved once per request by Hono middleware from the session cookie, then frozen. Repositories read it; they never mutate it.

### 6.2 Scoped provider

The existing `ScopedRepositoryProvider` pattern is correct and is retained conceptually: one instance per request, repositories memoised by class inside it, config cache attached to its lifetime. The difference is that it is constructed with the request's `db` rather than fetching a module-global client.

### 6.3 The unscoped path

`accounts/` — login, credential claim, magic-link redemption, student-code redemption — runs **before** a tenant exists. It therefore uses an explicitly separate construction path:

```ts
const ctx = createUnscopedContext(env);   // tenant: null, by design
```

Rules:
- Repositories under `accounts/` declare `tenant: null` and may query across schools.
- No other repository may accept a null tenant.
- No fallback tenant value exists anywhere in the codebase.

---

## 7. Errors

Repositories throw domain errors. Only HTTP middleware maps them to status codes — repositories never import from the HTTP layer.

| Error | HTTP | `code` | Notes |
|---|---|---|---|
| `DbEntityNotFoundError` | 404 | `NOT_FOUND` | From `unwrapSingleQueryResult` |
| `DbInternalError` | 500 | `INTERNAL_ERROR` | Wraps the driver error; never leaks SQL |
| `DbError` (base) | 500 | `DB_ERROR` | |

Validation, authentication, permission, and tenant-mismatch errors are **not** repository errors. They are raised by the service layer and mapped there — see `02-service-layer.spec.md`.

Envelope (flat — defined once in [03 §5.3](./03-http-layer.spec.md)):

```json
{ "error": "NOT_FOUND", "message": "Student with id '42' not found", "requestId": "..." }
```

Rules:
- `code` is stable and machine-readable; `message` is human-facing and may change.
- Driver errors are logged with the cause and returned without it.
- A 404 must never reveal whether a row exists in another tenant — the tenant predicate runs first.

---

## 8. Transactions

D1 rejects `BEGIN`, so `db.transaction()` cannot be used. `db.batch()` is atomic and counts as one query. A batch cannot read a generated id between statements, so each site below is classified by that limitation.

| # | Site | Current behaviour | D1 strategy |
|---|---|---|---|
| 1 | [student.repo.ts:683](../../src/lib/server/repository/student.repo.ts#L683) `demoteStudent` | Updates student placement, writes a promotion record | **Batch.** Pre-generate the promotion row id; no mid-flight read needed. |
| 2 | [student.repo.ts:990](../../src/lib/server/repository/student.repo.ts#L990) `promoteStudent` | Read-then-write: reads current chat groups, then rewrites membership | **Read → compute → batch.** The read stays outside; membership deletes and inserts go into one batch. |
| 3 | [parent.repo.ts:101](../../src/lib/server/repository/parent.repo.ts#L101) `updateParentEmail` | Updates `users.email` and `sm_parents.guardians_email` together | **Batch of 2.** No generated ids. |
| 4 | [assessment.service.ts:249](../../src/lib/server/service/assessment.service.ts#L249) `upsertStudentResult` | Multi-table upserts for one result | **Batch.** All keys known before execution. |
| 5 | [assessment.service.ts:390](../../src/lib/server/service/assessment.service.ts#L390) `upsertMarksheet` | Deletes stale marks then inserts the submitted set | **Batch.** Deletes and inserts are independent statements with known keys. |

Rules:
- `batchOrThrow()` wraps `db.batch` and enforces the maximum statement count per call (chunking larger sets into several batches would break atomicity — if a flow exceeds one batch, it must be redesigned, not chunked silently).
- Any flow that genuinely needs a value generated by an earlier statement must pre-generate it (`crypto.randomUUID()`) rather than rely on `RETURNING` mid-batch.
- Rollback tests are rewritten, not deleted: assert that a failure in statement *n* leaves *n−1* statements unapplied.

---

## 9. Developer experience conventions

### 9.1 Naming

| Operation | Prefix | Returns |
|---|---|---|
| Read one | `find…` | `T \| null` |
| Read many | `list…` | `T[]` (or a page object) |
| Create | `create…` | the created key or `void` |
| Update | `update…` | the updated key or `void` |
| Upsert | `upsert…` | the key |
| Delete | `delete…` | `void` |
| Existence | `exists…` | `boolean` |

No `get…` in new code — `get` is ambiguous between “find” and “fetch-and-throw”.

### 9.2 Types

- Row types derive from the schema: `type StudentRow = typeof smStudents.$inferSelect`.
- Insert shapes derive from `$inferInsert`.
- Projections return explicit object types, never `$inferSelect` when only three columns were selected.
- Every exported function declares its return type (R4).

### 9.3 Pagination

```ts
type Page<T> = { rows: T[]; nextCursor: string | null };
type PageQuery = { limit: number; cursor?: string };
```

Keyset only — no `OFFSET` (O10). `limit` is clamped to a maximum in the helper, not at call sites.

### 9.4 Imports

- A repository imports tables from `$lib/server/db/sms-schema` and helpers from `base/`.
- A repository **never** imports another repository.
- Consumers import from the folder barrel or the root barrel — never a deep file path.

### 9.5 Query budget

Every repository method documents its **own** statement count; methods that exceed three statements explain why in a comment. The per-use-case budget (≤10 statements per request) is owned by the service layer and declared in `02-service-layer.spec.md` — see [01a](./01a-d1-optimization.playbook.md) O15 for the number itself.

---

## 10. Testing and acceptance

### 10.1 Test layers

| Layer | Runs against | Covers |
|---|---|---|
| Unit | `@cloudflare/vitest-plugin` with local D1 | Query shape, chunking boundaries, mapping |
| Parity | Local D1 seeded from a fixture | Stage 1 behaviour matches the MySQL implementation for the same fixture |
| Isolation | Local D1 | No query returns rows from another `school_id` |
| Migration | `wrangler d1 migrations apply --local` | Index counts, column counts, FK validity |

### 10.2 Mandatory tests

1. **Tenant isolation** — for every public read method, seed two schools and assert only the caller's rows are returned. This is the test that catches a missing `school_id` predicate, which is the failure mode with the highest blast radius.
2. **Chunk boundary** — `chunkedInArray` with 0, 1, 95, 96, 190, 191 ids; `chunkedInsert` at exactly 100 binds and at 101.
3. **Batch atomicity** — a statement failure mid-batch leaves no partial write.
4. **Index presence** — per-table counts against `docs/cloudflare-port/audit/db-inventory.json`.
5. **Column cap** — every table ≤100 columns.

### 10.3 Acceptance criteria for the port

- [ ] All 62 legacy tables created with 226 secondary indexes, plus the redesigned tables specified in 04–06
- [ ] Zero `db.transaction(` in the repository layer (R6)
- [ ] Zero `any` / `as any` in `repository/` (R4)
- [ ] Every repository exported from both barrels (R8)
- [ ] No repository imports another repository (R9)
- [ ] Tenant-isolation suite green for every repository
- [ ] Every former transaction site has a passing atomicity test
- [ ] No file over 300 lines (R7 exception list empty or documented)

### 10.4 What this spec does not cover

Service orchestration is [02](./README.md); HTTP routes and middleware are [03](./README.md); schema translation, index recovery execution, and cutover are [05](./README.md).
