# 18 — Operation and Tool Inventory

**Draft.** Derived from the current route tree and the Phase 9B plans. Counts are inventory, not a promise that every path becomes an agent tool.

## Summary

- Current HTTP: **99 method/path operations across 92 unique paths** (automated extraction plus 10A).
- Agent-facing tools: **role packs**, not one tool per endpoint.
- Local workspace tools: Tauri/Rust commands, not HTTP endpoints.
- Phase 9B: documentation only.
- Existing endpoints are Phase 8/9A production surfaces; do not rebuild them.
- New product endpoints belong to Phase 10, except auth work owned by Phase 9A.

## Current endpoints

### Public, auth, health and assets

| Method | Path |
|---|---|
| GET | `/health` |
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/logout` |
| POST | `/api/v1/auth/logout-all` |
| POST | `/api/v1/auth/refresh` |
| POST | `/api/v1/auth/mobile/login` |
| POST | `/api/v1/auth/mobile/logout` |
| POST | `/api/v1/auth/mobile/refresh` |
| POST | `/api/v1/auth/claim` |
| POST | `/api/v1/auth/code` |
| POST | `/api/v1/auth/mobile/code` |
| GET | `/api/v1/auth/google/start` |
| GET | `/api/v1/auth/google/callback` |
| GET | `/r/:token` |
| GET | `/uploads/students/:file` |

### Self and settings

| Method | Path |
|---|---|
| GET, PATCH | `/api/v1/me` |
| GET | `/api/v1/agent/capabilities` |
| GET, POST | `/api/v1/settings/academic-years` |
| GET, PUT | `/api/v1/settings/academic-years/active` |
| GET, POST | `/api/v1/settings/exam-types` |
| PATCH | `/api/v1/settings/exam-types/:examTypeId/active` |
| GET, PATCH | `/api/v1/settings/general` |
| GET, PATCH | `/api/v1/settings/report-templates` |

### Students, attendance and assessment

| Method | Path |
|---|---|
| GET | `/api/v1/students` |
| PATCH | `/api/v1/students/:studentId/status` |
| POST | `/api/v1/students/:studentId/promotions` |
| POST | `/api/v1/students/:studentId/demotions` |
| PUT, DELETE | `/api/v1/students/:studentId/photo` |
| POST | `/api/v1/students/:studentId/photo/claim` |
| GET | `/api/v1/students/:id/marksheets` |
| GET | `/api/v1/students/:id/marksheets/:sessionId/:examTypeId` |
| GET | `/api/v1/students/:id/marksheets/:sessionId/:examTypeId/versions` |
| POST | `/api/v1/students/:id/marksheets/:examTypeId/review` |
| POST | `/api/v1/students/:id/marksheets/:examTypeId/publish` |
| POST | `/api/v1/students/:id/marksheets/:sessionId/:examTypeId/supersede` |
| POST | `/api/v1/students/:id/marksheets/:examTypeId/pdf` |
| POST | `/api/v1/students/:id/marksheets/:sessionId/:examTypeId/pdf` |
| GET | `/api/v1/students/:id/transcripts` |
| GET | `/api/v1/students/:id/transcripts/:sessionId` |
| POST | `/api/v1/students/:id/transcripts/pdf` |
| POST | `/api/v1/students/:id/transcripts/:sessionId/pdf` |
| PUT | `/api/v1/attendance` |
| POST | `/api/v1/subjects/assignments` |
| POST | `/api/v1/assessments/marksheets` |
| PUT | `/api/v1/assessments/results` |
| GET | `/api/v1/assessments/results/:identifier/:examId` |
| GET | `/api/v1/assessments/transcripts/:studentId/:academicId` |
| PUT | `/api/v1/assessments/feedback/ratings` |
| PUT | `/api/v1/assessments/feedback/remarks` |
| POST | `/api/v1/assessments/ocr/extractions` |
| DELETE | `/api/v1/assessments/ocr/cache` |
| POST | `/api/v1/assessments/captures` |
| POST | `/api/v1/assessments/captures/:captureId/confirmation` |
| POST | `/api/v1/assessments/publish/results` |
| POST | `/api/v1/assessments/publish/transcript` |

### Admin

| Method | Path |
|---|---|
| POST | `/api/v1/admin/auth/claim-reset` |
| POST | `/api/v1/admin/sessions/bootstrap` |
| GET | `/api/v1/admin/sessions/bootstrap/:jobId` |
| GET | `/api/v1/admin/sessions/:id/integrity` |
| GET | `/api/v1/admin/sessions/:id/resolutions` |
| GET | `/api/v1/admin/sessions/:id/staffing` |
| POST | `/api/v1/admin/sessions/:id/staffing/accept-copied` |
| PUT | `/api/v1/admin/sessions/:id/classes/:classId/sections/:sectionId/staffing` |
| POST | `/api/v1/admin/sessions/:id/terms` |
| POST | `/api/v1/admin/sessions/:id/promote` |
| GET | `/api/v1/admin/sessions/:id/promotion/:jobId` |
| GET | `/api/v1/admin/sessions/:id/promotion/quarantine.csv` |
| GET | `/api/v1/admin/sessions/:id/promotion/quarantine.pdf` |
| POST | `/api/v1/admin/promotion/batches/:batchId/reverse` |
| POST | `/api/v1/admin/sessions/:id/archive` |
| GET | `/api/v1/admin/sessions/:id/archive/status` |
| GET | `/api/v1/admin/sessions/:id/archive/manifest` |
| POST | `/api/v1/admin/sessions/:id/restore` |
| DELETE | `/api/v1/admin/archive` |
| GET | `/api/v1/admin/jobs` |
| POST | `/api/v1/admin/jobs/:id/resume` |
| POST | `/api/v1/admin/jobs/:id/cancel` |
| POST | `/api/v1/admin/jobs/:id/approve` |
| GET | `/api/v1/admin/duplicate-emails` |
| GET | `/api/v1/admin/duplicate-emails/export` |
| POST | `/api/v1/admin/duplicate-emails/flag` |
| POST | `/api/v1/admin/duplicate-emails/merge` |
| POST | `/api/v1/admin/duplicate-emails/reassign` |
| POST | `/api/v1/admin/student-codes/issue` |
| POST | `/api/v1/admin/student-codes/:studentId/reissue` |
| DELETE | `/api/v1/admin/student-codes/:studentId` |
| POST | `/api/v1/admin/tokens/:tokenId/revoke` |
| POST | `/api/v1/admin/results/:id/override` |
| GET | `/api/v1/admin/issues` |
| GET | `/api/v1/admin/issues/:id` |
| POST | `/api/v1/admin/issues/:id/plan` |
| POST | `/api/v1/admin/issues/:id/apply` |

The current tree contains other internal Hono context reads (`c.get("ctx")`) that are not route operations; the inventory excludes them.

## Missing endpoints

| Endpoint/group | Purpose | Owner phase |
|---|---|---|
| Magic-link request/callback/verify | Finish 04a auth | **9A** |
| `/api/v1/auth/claim` removal | Retire transitional surface | **9A** |
| Device registration/revocation | iroh device identity, per-user sync | **10C** |
| `/api/v1/agent-sync/push`, `/pull`, `/snapshot` | Yjs/event sync against the separate `AGENT_DB`; no EdApex school data | **10C** |
| `GET /api/v1/agent/capabilities` | Authenticated role/tool manifest | **10A** |
| `GET /api/v1/admin/issues` | Unified issue queue | **10A** |
| `GET /api/v1/admin/issues/:id` | Issue detail | **10A** |
| `POST /api/v1/admin/issues/:id/plan` | Dry-run resolution plan | **10A** |
| `POST /api/v1/admin/issues/:id/apply` | Human-approved apply | **10A** |
| Bulk plan/apply | Controlled admin batch decisions | **10A** |
| Public application create/draft/status | Progressive applicant identity | **10E** |
| Public documents/verification | Application evidence | **10E** |
| Parent-child link/approval | Safe guardian linking | **10E** |
| Staff registration/invite/approval | Staff onboarding | **10E** |
| Student create/edit/enroll | Registrar workflow | **10E** |
| Class/section CRUD | General academic setup | **10E** |
| Subject CRUD | General academic setup | **10E** |
| Student transfer/graduate/withdraw | Lifecycle operations | **10E** |
| Notification status/retry | Email/SMS delivery | **10E** |
| Artifact persistence API | Only if school-data artifacts must be server-stored; otherwise local workspace | **10E/10F decision** |
| Workflow/shell/artifact HTTP | None: these are local Tauri/Rust commands | **10C/10D** |

## Agent tools (capability packs)

Do not expose every endpoint. Use role packs with max 5 tools × 8 operations:

| Tool pack | Operations | Roles |
|---|---|---|
| `people` | search/get/update/status/parent-child link | parent/student read; teacher/admin scoped |
| `academics` | class/section/subject/staffing/promotion read/plan | teacher read; admin write |
| `attendance` | get class/student; write attendance | teacher/admin |
| `assessment` | marksheet, feedback, report card, transcript | teacher/admin |
| `admin_issues` | list/get/plan/apply | admin; apply human-approved |
| `admissions` | review application/decision; enrollment plan/apply | admin |
| `workspace` | files, workflow, shell, code | admin/teacher |
| `public_forms` | **not an agent pack** — public web forms only | public |

The exact tool schema is generated from the capability registry; the 87 HTTP paths are backend operations, not 87 Needle tools.

## Local tools (Rust/Tauri, not HTTP)

- `workspace.fs.read/list/search/write/patch`
- `workspace.shell.exec` — allowlisted commands only
- `workspace.workflow.run` — typed TS IR
- `workspace.code.run` — sandboxed JS/WASM
- `workspace.artifact.create/update/open` — UI command
- `documents.import` — local DOCX/PDF/CSV/Markdown parse to an artifact
- `documents.render` — local PDF/DOCX/CSV rendition from an artifact version
- `documents.preview` — PDF.js view / DOCX semantic preview / CSV table
- `sync.pair/status/revoke` — iroh device state
- `agent.route/extract` — Needle 3 internal
- `agent.plan` — xcodex internal
- `genui.present` — internal xcodex surface event, **not an agent tool and not counted against the 5-tool budget**
- `genui.action` — closed action bridge from an OpenUI surface; server-backed, not local authority
- `approval.request/decide` — server-backed, not local authority

## Phase assignment

| Phase | Endpoint/tool work |
|---|---|
| **8** | Existing cutover only; no new endpoints |
| **9A** | Magic-link auth, claim retirement, digest cleanup, retention; existing auth endpoints |
| **9B** | Documentation only — this inventory and UI/capability specs |
| **10A** | Capability manifest, admin issues plan/apply, capability registry **(implemented)** |
| **10B** | UI only; consumes 10A and existing endpoints |
| **10C** | Local agent/Needle/iroh; device registration/revocation endpoint |
| **10D** | Local workflow/shell/sandbox and artifact UI commands; no HTTP |
| **10E** | Public applications, admissions/enrollment, staff registration, student/class/subject/transfer operations |
| **10F** | Evaluation/rollout; no new product endpoints |
| **v2** | No new API; native mobile reuses the same contracts |

## Rules

- Phase 9B does not implement any endpoint.
- Do not create all missing endpoints speculatively; implement only the v1 journey slices.
- Existing endpoints are not automatically agent tools.
- Public forms are not agent tools.
- Local workspace tools are not HTTP endpoints.
- GenUI presentation is not a capability tool; it is a typed output of an authorized tool result. It does not expand the 5-tool/8-operation budget.
- CF Workers remain the only EdApex data/session authority.
