# 10 — Capabilities and Roles

**Implemented in 10A:** `GET /api/v1/agent/capabilities`, shared `@edapex/contracts`, and the admin issue plan/apply contract. Public applicant forms remain contract-only until 10E.

## Roles

| Role | v1 access |
|---|---|
| Public applicant | Applications, drafts, status; no active account |
| Parent | Own children read; profile; published reports; no school writes |
| Student | Own records read; published reports; no school writes |
| Teacher | Own class roster, attendance, marks, feedback, report review/publish where authorized |
| Admin | People, admissions, enrollment, staffing, promotion/transfer, settings, issues |
| Super admin | Bootstrap, migration, sessions, archive, tokens |
| Accountant/Receptionist/Librarian/Driver/Others | Only capabilities explicitly implemented; no invented agent tools |

Agent permissions never exceed the authenticated user's permissions. The server enforces roles; the browser/LLM does not.

## Capability groups

- `people`: students, parents, staff, profiles, status, guardian links
- `academics`: classes, sections, subjects, routines, staffing, promotion/transfer
- `assessment`: marksheets, feedback, report cards, transcripts
- `attendance`: class/student attendance
- `admissions`: public applications, review, offers, enrollment
- `admin_issues`: unplaced/no-current, unstaffed sections, shared emails, missing records, mismatches
- `workspace`: files, workflows, shell, code sandbox
- `public_forms`: application/signup forms, not agent tools

## Capability registry

Every capability declares:

```text
id, version, domain, description
allowedRoles, risk(read|write|destructive)
approval(required|none), idempotent
scope(school|class|self), inputSchema, outputSchema
toolPack, enabled, deprecation
```

The server exposes only the authenticated user's manifest. The UI loads only the current role/context pack.

## Tool budget

- Max **5 tools** per role/turn.
- Max **8 operations** per tool.
- Descriptions short; no full API docs in the model context.
- Public forms are not agent tools.
- Admin issues are one domain tool with plan/apply, not one tool per student.
- CI rejects packs over budget.
- GenUI presentation is not a capability/tool; it is a typed output shape. It does not add a sixth tool or change the 8-operation limit.
- Telemetry prunes unused capabilities.

## Existing vs missing

The API currently has roughly 98 unique path literals. Existing coverage includes auth, students, staffing, promotion, attendance, assessments, reports, archives, settings and migration. Missing for v1 planning include public applications, enrollment, staff registration, class/section CRUD, transfer/graduation, unified admin issues and the workspace tools.

Phase 10 builds only the capabilities needed for the v1 slices; not all endpoints.
