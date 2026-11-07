# Phase 7 rehearsal report

Generated from `apps/api/.tmp/rehearsal-a/evidence.json` and `rehearsal-b`.
Counts and checksums only; no personal data.

## Source and load

- Source SHA-256: `6199720481c1dc02d49eef9e39f05642057ff45fc64a119c6e5f3543f6d6f9da`
- Status: **completed**
- Tables: 62
- Rows loaded: 196801
- Resolutions: 1711
- Foreign keys: 0 violations (preflight + post-load check)
- Reconciliation mismatches: 0

### Transform findings

| Finding | Count |
|---|---|
| R1 | 5 |
| R2 | 9 |
| R3 | 3 |
| R4 | 0 |
| C1 | 30 |
| P3 | 78 |
| P4 | 179 |
| F1 | 2 |
| F2 | 33 |
| D1 | 41 |
| D2 | 24 |
| TERM | 7 |
| SETTINGS | 1 |
| PASSWORDS | 1566 |
| PHOTOS | 853 |

## Integrity

| Check | Source session | Target session |
|---|---|---|
| Blocking identity | 0 | 0 |
| Blocking target | 27 | 0 |
| Gate | red | green |

## Bootstrap

- Dry-run planned classes: 14; sections: 3
- Classes: 14
- Sections: 3
- Subjects: 19
- Class-sections: 42
- Subject assignments: 231 active copied; 463 source rows (232 inactive, not copied)
- Class teachers copied: 0 (skipped 0)
- Routines copied: 0
- Student categories: 6
- Grade bands: 7
- Exam configurations: 189
- Activation: 0 (first bootstrap run; activation job: 1)
- Readiness after bootstrap: 15 unstaffed, 42 unreviewed, 0 current records
- Final readiness: 0 unstaffed, 0 unreviewed, 663 current records, 0 duplicate defaults

## Staffing review

- Sections before: 42
- Accepted copied: 27
- Manually reviewed: 15
- Remaining unreviewed: 0

## Archive and purge

| Session | Status | Objects | Summaries | Manifest | Gaps |
|---|---|---|---|---|---|
| 1 | archived | 652 | 1922 | 652 | 74 |
| 2 | archived | 0 | 0 | 0 | 0 |
| 4 | archived | 641 | 1880 | 641 | 16 |

Live historical rows after purge:

| Table | Rows |
|---|---|
| sm_mark_stores | 0 |
| sm_result_stores | 0 |
| student_ratings | 0 |
| teacher_remarks | 0 |
| class_attendances | 0 |
| sm_student_attendances | 0 |

Gaps are historical students with no complete transcript (missing placement/records);
the manifest lists them and the objects that exist all verify by checksum.

## Promotion

- Dry-run batches: 11
- Promoted (non-DAYCARE): 639
- DAYCARE retained: 24
- Unplaced (no class): 3
- No current record: 234
- Destination current records: 663
- Quarantine rows: 237
- Year-4 records: 681 (666 unique default, 15 non-default duplicates)

The 681 year-4 records reconcile as 666 unique students plus 15 non-default
duplicate records. Promotion uses `is_default = 1`, so the destination has 663
current records (639 promoted + 24 DAYCARE) and the 3 class-null students are
reported as UNPLACED. The 15 duplicates are historical, non-default rows and are
not promoted; promoting them would violate the one-current-record invariant.

## Photos and timelines

- Referenced photo URLs: 853 (853 images, 0 PDFs, 0 other)
- Missing image files: 228 (local static tree is partial; the source owner must supply these for the production upload)
- Uploadable images: 625
- Uploaded in this run: 25 of 625 (sample; the production runbook uses `--photos full`)
- Image bytes: 123509495
- Public photo sample: 200
- Timeline exports: 2
  - session 1: 6810 rows, 2335199 bytes, SHA-256 `ebb2f32dfbb41f699202235947fb03906ca7a9c9e77e54e32097f7ddb5c57f3a`
  - session 4: 648 rows, 308437 bytes, SHA-256 `ad1407172f82be1b6e0f2ae1bb114702c1b6d690e1906c7866c990133e07ad4a`

## Two-run comparison

- Run B status: **completed**
- Run B rows: 196801
- Run B destination records: 663
- Run B quarantine: 237
- The machine comparison is in `.tmp/rehearsal-a/reconciliation.json`.

## O2 index evidence

# O2 index audit

Scratch database: `/home/beznet/Workspace/edapex/apps/api/.tmp/rehearsal-a`

| Query | Expected index | Present | Plan uses it | Plan |
|---|---|---|---|---|
| records-by-student-default | `student_records_school_academic_student_default_index` | yes | yes | SEARCH student_records USING INDEX student_records_school_academic_student_default_index (school_id=? AND academic_id=? AND student_id=? AND is_default=?) |
| marks-by-term-class-section | `sm_mark_stores_school_academic_term_class_section_index` | yes | yes | SEARCH sm_mark_stores USING INDEX sm_mark_stores_school_academic_term_class_section_index (school_id=? AND academic_id=? AND exam_term_id=? AND class_id=? AND section_id=?) |
| results-by-exam-class-section | `sm_result_stores_school_academic_exam_class_section_index` | yes | yes | SEARCH sm_result_stores USING INDEX sm_result_stores_school_academic_exam_class_section_index (school_id=? AND academic_id=? AND exam_type_id=? AND class_id=? AND section_id=?) |
| assignments-by-class-section | `sm_assign_subjects_school_academic_class_section_index` | yes | yes | SEARCH sm_assign_subjects USING INDEX sm_assign_subjects_school_academic_class_section_index (school_id=? AND academic_id=? AND class_id=? AND section_id=?) |
| class-sections-by-class-section | `sm_class_sections_school_academic_class_section_index` | yes | yes | SEARCH sm_class_sections USING INDEX sm_class_sections_school_academic_class_section_index (school_id=? AND academic_id=? AND class_id=? AND section_id=?) |
| students-by-class-section | `sm_students_school_academic_class_section_index` | yes | yes | SEARCH sm_students USING INDEX sm_students_school_academic_class_section_index (school_id=? AND academic_id=? AND class_id=? AND section_id=?) |
| attendance-by-class-section | `sm_student_attendances_school_academic_class_section_index` | yes | yes | SEARCH sm_student_attendances USING INDEX sm_student_attendances_school_academic_class_section_index (school_id=? AND academic_id=? AND class_id=? AND section_id=?) |
| fees-by-student | `sm_fees_assigns_school_academic_student_index` | yes | yes | SEARCH sm_fees_assigns USING INDEX sm_fees_assigns_school_academic_student_index (school_id=? AND academic_id=? AND student_id=?) |
| remarks-by-student-term | `teacher_remarks_academic_student_term_index` | yes | no | SEARCH teacher_remarks USING INDEX tr_student_exam_academic_unq (student_id=? AND exam_type_id=? AND academic_id=?) |
| ratings-by-student-term | `student_ratings_academic_student_term_index` | yes | yes | SEARCH student_ratings USING INDEX student_ratings_academic_student_term_index (academic_id=? AND student_id=? AND exam_type_id=?) |

All expected O2 indexes are present.


