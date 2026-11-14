# 06 — Archive and Retrieval

Historical academic records for EdApex on D1 and R2: what gets archived, how it is retrieved, how report-card corrections are versioned, and how deletion is controlled. Companion spec: [05 — D1 migration](./05-d1-migration.spec.md).

---

## 1. Why archive at all

| Measurement | Value |
|---|---|
| Ported data volume | 74.0 MB |
| Marks + results | **56.0 MB** (43.2 + 12.8) |
| Rows | 119,484 marks, 30,775 results |
| D1 budget | 500 MB free / 10 GB paid |

At today's size nothing *must* move, but the growth rate is per-student × per-subject × per-term, so every completed session adds a fixed block. The design goal is not to save space now — it is to make session closure a repeatable operation so the database never becomes the constraint.

The second, stronger reason is **fidelity**: a report card is a document that was issued. It must render the same in 2030 as it did in 2025.

---

## 2. Why the assembled Marksheet is the archive unit

`getStudentResult` is not a table read. It assembles ([assessment.service.ts:539](../../src/lib/server/service/assessment.service.ts#L539)):

- student identity, class, section, session label, attendance days, photo
- school name, phone, email, **logo**, address parsed from settings, vacation date
- per-subject records, objectives, ratings, teacher remark
- score, average, **classAverage computed from the whole class**, max scores
- a public token for the PDF URL

Recomputing that in 2027 produces a *different document*: the class average changes when marks change, the school logo may be rebranded, and the student's class has moved on. Archiving the assembled object is what makes a reissued transcript truthful.

Raw rows are archived alongside it for analysis, but the rendered artifact is the authoritative copy.

---

## 3. Storage model

| Layer | Location | Contents |
|---|---|---|
| **Detail objects** | R2 | One object per `(student, session)` containing every marksheet plus the transcript input |
| **Summary** | D1 `session_result_summary` | One row per student per session per term: total, average, grade, GPA, position |
| **Index** | D1 `archive_objects` | Key, checksum, bytes, session, student, schema version |
| **Jobs** | D1 `session_jobs` | Resumable archive/restore state |

### 3.1 Object layout

```text
schools/{schoolId}/sessions/{sessionId}/students/{studentId}.json
```

```json
{
  "schemaVersion": 1,
  "meta": {
    "schoolId": 1, "sessionId": 4, "studentId": 312,
    "studentRecordId": 1180, "archivedAt": "2026-09-01T10:00:00Z"
  },
  "placement": {
    "academicId": 4, "sessionLabel": "2025/2026",
    "classId": 22, "className": "MIDDLE BASIC 6",
    "sectionId": 5, "sectionName": "A"
  },
  "terms": {
    "5": { "id": 5, "sequence": 1, "name": "FIRST TERM",
           "display": "FIRST TERM EXAMINATION — DEC/2025",
           "startsOn": "2025-09-15", "endsOn": "2025-12-19" }
  },
  "marksheets": { "5": { "student": {}, "school": {}, "records": [], "score": {}, "ratings": [], "remark": {} } },
  "transcript": { "terms": [], "summary": {} },
  "photoKey": "photos/312.jpg"
}
```

`placement` and `terms` are snapshots. Without them, a 2025 report printed in 2027 would show the student's *current* class and the school's *current* branding.

Images are stored by key, never as base64 — they are the bulk of the payload and can be re-attached at render time.

### 3.2 Queryable summary

`session_result_summary` exists because blobs cannot answer "show this child's trend across five years". Columns: `school_id`, `academic_id`, `student_id`, `term_id`, `sequence`, `total`, `average`, `grade`, `gpa`, `position`, `subject_count`. Roughly 13.5k rows for five sessions — small enough to index and query directly.

---

## 4. Report card lifecycle

```
draft → reviewed → published → (superseded by a new version)
```

| State | Who | Effect |
|---|---|---|
| `draft` | Teacher | Editable; not visible to parents |
| `reviewed` | Class teacher / admin | Marks frozen; still not visible |
| `published` | Admin | Visible to parents; archived as the issued document |
| `superseded` | Admin | A correction created version *n+1*; version *n* remains retrievable |

Rules:

- Publishing writes the archive object **at that moment**; later edits create a new version, never mutate the old one.
- The report card carries `version` and `publishedAt`; the PDF footer prints both.
- After term closure, marks are locked. A change requires `POST /api/v1/admin/results/:id/override` with a reason string, which appends to `grade_change_audit` (actor, before, after, reason, timestamp) and triggers re-publication as a new version.
- Missing marks are stored as `NULL`, distinct from `0`. Averages exclude unassessed components, and the report prints `ABS` rather than a zero.

---

## 5. Retrieval API

| Method | Path | Source | Notes |
|---|---|---|---|
| `GET` | `/api/v1/students/:id/marksheets?examTypeId&sessionId` | live or archive | Returns the `Marksheet` shape unchanged |
| `GET` | `/api/v1/students/:id/marksheets/:sessionId/:examTypeId` | archive | Immutable; `ETag`, long cache |
| `POST` | `/api/v1/students/:id/marksheets/:examTypeId/pdf` | live | Draft or published |
| `POST` | `/api/v1/students/:id/marksheets/:sessionId/:examTypeId/pdf` | archive | Re-renders the issued document |
| `GET` | `/api/v1/students/:id/transcripts/:sessionId` | archive or live | Per-session transcript |
| `GET` | `/api/v1/students/:id/transcripts` | summary + archive links | Cross-session history |
| `POST` | `/api/v1/students/:id/transcripts/:sessionId/pdf` | archive | |
| `GET` | `/r/:token` | public router | No session; signed, expiring |
| `GET` | `/api/v1/admin/sessions/:id/archive/manifest` | index | Coverage, checksums, gaps |

### 5.1 Token scope

The current bailer token encodes `{ studentId, examId }`, which is insufficient once archives exist — exam ids are session-local. The new token carries:

```json
{ "studentId": 312, "sessionId": 4, "examTypeId": 5, "version": 1, "exp": 1790000000 }
```

Signed, single-purpose, expiring. The public router never receives `c.var.user` or `c.var.tenant`.

### 5.2 Access

- Staff: any student in their school, subject to tenant scope.
- Parents: only their own children, and only `published` versions.
- Public tokens: exactly one document; revocable by reissuing.

### 5.3 Report-card workflow endpoints

| Method | Path | Transition |
|---|---|---|
| `POST` | `/api/v1/students/:id/marksheets/:examTypeId/review` | `draft` → `reviewed`; freezes marks |
| `POST` | `/api/v1/students/:id/marksheets/:examTypeId/publish` | `reviewed` → `published`; writes the archive object |
| `POST` | `/api/v1/students/:id/marksheets/:sessionId/:examTypeId/supersede` | Creates version *n+1*; requires a reason; never mutates version *n* |
| `GET` | `/api/v1/students/:id/marksheets/:sessionId/:examTypeId/versions` | Lists versions with `publishedAt`, actor, reason |
| `POST` | `/api/v1/admin/results/:id/override` | Grade change after closure; requires reason, writes `grade_change_audit` |
| `POST` | `/api/v1/admin/tokens/:tokenId/revoke` | Invalidates a public document link |
| `POST` | `/api/v1/students/:id/transcripts/pdf` | Cross-session transcript PDF, assembled from summary rows + archive objects |

---

## 6. Archive, restore, purge

```http
POST   /api/v1/admin/sessions/:id/archive       { "purge": false, "dryRun": false }
GET    /api/v1/admin/sessions/:id/archive/status
GET    /api/v1/admin/sessions/:id/archive/manifest
POST   /api/v1/admin/sessions/:id/restore       { "dryRun": false }
DELETE /api/v1/admin/archive                    { "confirm": "WIPE_ALL_ARCHIVES",
                                                  "sessionIds": [1,2,4],
                                                  "secondAdminToken": "...",
                                                  "dryRun": true }
```

### 6.1 State machine

```
active → closing → archived → archived_readable
                     ↑              │
                     └── restore ───┘
```

- **archive**: export → verify checksums → write summary + index → mark `archived`. Live rows are retained unless `purge: true`.
- **purge**: only after verification; deletes the archived session's live rows. `dryRun` returns the row counts that would be removed.
- **restore**: re-imports into staging tables with `PRAGMA defer_foreign_keys`, swaps if the purge had removed them, then marks `archived_readable`. Restore is **read-only** — a restored session never accepts writes, because two writable sessions corrupt promotion state.
- **wipe**: removes all archive objects and index rows. Requires two distinct admins, the literal confirmation string, `dryRun` output reviewed first, and writes an `auth_events` row. Blocked while any restore is running.

### 6.2 Failure handling

| Failure | Behaviour |
|---|---|
| Worker dies mid-export | `session_jobs` checkpoint; next run resumes from the last completed student |
| Checksum mismatch | Object quarantined; student marked `archive_failed`; job continues |
| Unknown `schemaVersion` | Retrieval returns `409 ARCHIVE_VERSION_UNSUPPORTED`; never guesses |
| Restore with missing object | Job aborts before touching live tables |

### 6.3 Job control

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/admin/jobs?type=archive\|restore\|wipe&status=` | List resumable jobs with progress |
| `POST` | `/api/v1/admin/jobs/:id/resume` | Resume from the last checkpoint |
| `POST` | `/api/v1/admin/jobs/:id/cancel` | Allowed before the destructive phase only |
| `POST` | `/api/v1/admin/jobs/:id/approve` | Second administrator issues the approval token |

**`secondAdminToken` semantics:** a short-lived (5 minute), single-use token bound to one job id, issued by a *different* administrator than the one who created the job. The server verifies both actor ids differ before accepting a wipe. A token reused, expired, or presented by the initiating admin is rejected.

---

## 7. Retention

| Data | Retention | Rationale |
|---|---|---|
| Transcripts, published marksheets | **Permanent** | Long-lived credentials for university and employment |
| Attendance, homework, chat, timelines | ~7 years after session close | Operational detail with limited long-term value |
| Raw mark rows | 7 years | Needed for disputes and re-rendering |
| Audit events | Per school policy, minimum 3 years | Grade changes and access must remain provable |

### 7.1 Retention sweep

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/admin/retention/sweep` | Body `{ dryRun }`. Deletes operational detail older than the policy window; never touches transcripts or published marksheets |
| `GET` | `/api/v1/admin/retention/policy` | Returns the active windows and next scheduled run |

The sweep runs as a `session_jobs` entry, is resumable, and reports per-table deletion counts before and after. `dryRun` is the default in the UI.

Parents may read their own children's published documents but can never delete. Staff export on request. Deletion requests are honoured through the wipe endpoint with dual control, and produce an audit record.

---

## 8. Acceptance criteria

- [ ] Archive object contains `schemaVersion`, `placement`, `terms`, marksheets, transcript
- [ ] Summary rows exist for every archived student-term
- [ ] Marksheet live and archived paths return the same shape
- [ ] Transcript per session and cross-session both work
- [ ] Published versions are immutable; corrections create version *n+1*
- [ ] Grade changes after closure require a reason and write an audit row
- [ ] Missing marks render as `ABS`, excluded from averages
- [ ] Token scope includes session + term + version
- [ ] Restore is read-only (`archived_readable`)
- [ ] Wipe requires two admins, confirmation string, audit row, and passes `dryRun`
- [ ] Checksum failure quarantines the object without aborting the job

## 9. Risks

| Risk | Mitigation |
|---|---|
| Archived object diverges from the Marksheet schema | `schemaVersion` + refusal on unknown versions |
| Class average cannot be reproduced | The assembled document is stored, not recomputed |
| Restore silently reintroduces writable history | Restored sessions are marked `archived_readable`; writes rejected at the service layer |
| Wipe executed by one compromised account | Two-administrator control plus typed confirmation plus audit |
| Archive blobs become unreadable | Checksums verified on write and on read; manifest exposes gaps |

---

## 10. Endpoint inventory

| Group | Method + path |
|---|---|
| Retrieval | `GET /api/v1/students/:id/marksheets` · `GET …/marksheets/:sessionId/:examTypeId` · `GET …/transcripts/:sessionId` · `GET …/transcripts` |
| PDF | `POST …/marksheets/:examTypeId/pdf` · `POST …/marksheets/:sessionId/:examTypeId/pdf` · `POST …/transcripts/:sessionId/pdf` · `POST …/transcripts/pdf` |
| Workflow | `POST …/marksheets/:examTypeId/review` · `POST …/publish` · `POST …/supersede` · `GET …/versions` · `POST /api/v1/admin/results/:id/override` |
| Tokens | `GET /r/:token` (public) · `POST /api/v1/admin/tokens/:tokenId/revoke` |
| Session archive | `POST /api/v1/admin/sessions/:id/archive` · `GET …/archive/status` · `GET …/archive/manifest` · `POST …/restore` |
| Jobs | `GET /api/v1/admin/jobs` · `POST …/:id/resume` · `POST …/:id/cancel` · `POST …/:id/approve` |
| Deletion | `DELETE /api/v1/admin/archive` |
| Retention | `POST /api/v1/admin/retention/sweep` · `GET /api/v1/admin/retention/policy` |
