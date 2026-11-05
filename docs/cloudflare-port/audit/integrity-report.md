# Integrity audit

Source: `edapexdb.sql`

| ID | Invariant | Violations | Sample | Resolution |
|---|---|---|---|---|
| P1 | students with no valid user | 0 | — | Create a user or link the student to an existing one |
| P2 | staff with no valid user | 0 | — | Create a user or link the staff row |
| P3 | parents with no valid user | 78 | 2, 3, 8, 9, 13 | Create a user or link the parent row |
| P4 | users with no profile (non-admin) | 179 | 46, 48, 54, 57, 58 | Link to a profile or mark as administrator |
| F1 | students with no valid parent | 2 | 797, 798 | Link each student to a parent row |
| F2 | parents with no child | 33 | 30, 142, 221, 302, 316 | Remove the parent row or attach the child |
| R1 | students with no student_record | 5 | 212, 291, 411, 439, 927 | Create the current-year record during promotion |
| R2 | students with no default record | 9 | 212, 248, 280, 291, 411 | Set exactly one is_default row |
| R3 | students with multiple default records | 3 | 438, 400, 723 | Keep the newest, clear the rest |
| R4 | student_records pointing at a missing student | 0 | — | Delete or re-link the orphan record |
| Y1 | records whose class belongs to another academic year | 0 | — | Re-point class_id or correct academic_id |
| Y2 | exam setups whose exam belongs to another year | 0 | — | Re-point exam_id or correct academic_id |
| Y3 | marks whose exam_setup is missing | 0 | — | Quarantine — do not archive silently |
| D1 | parent rows sharing one user | 41 | 1294, 90, 103, 1253, 1336 | Dedupe to one parent row per user |
| D2 | user accounts sharing one email | 24 | email:b333d6063a88, email:d508603d8563, email:037db1effa9f, email:3c304191a787, email:59f6524d6f27 | Resolve manually in the admin utility |
| C1 | students with a class on sm_students | 30 | 438, 479, 504, 580, 685 | Placement normally lives in student_records; backfill before promotion |
| C2 | subject assignments in the source year | 463 | 1, 2, 3, 4, 5 | Must be copied into the new session or teachers see nothing |
