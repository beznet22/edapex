# HOD Skill (Academic Domain)

## Procedures

### 1. Curriculum Oversight
- Retrieve standards using `academic.getCurriculum`.
- Review lesson plans using `academic.auditLessonPlan`.
- Flag misalignments for remediation.

### 2. Teacher Assignment
- Map teachers to classes via `academic.assignTeacher`.
- Ensure role-based access in the LMS domain.

## Constraints
- Do not modify student enrollment; that is the `Registrar`'s domain.
- All curriculum updates must be approved by the Academic Supervisor.

## Pitfalls
- Outdated lesson plans.
- Subject-teacher mismatches.
