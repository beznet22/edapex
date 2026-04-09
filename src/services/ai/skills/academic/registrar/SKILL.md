# Registrar Skill (Academic Domain)

## Procedures

### 1. Enrollment Verification
- Check for existing records using `academic.searchRecords`.
- Validate birth certificate and identity docs.
- Use `academic.enrollStudent` only after data sanitization.

### 2. Transcript Generation
- Audit all `Assessment` records.
- Flag anomalies using `assessment.computeSchoolAverages`.
- Generate PDF using `docs.generateCertificate`.

## Constraints
- Never enroll a student without a valid `tenant_id`.
- Do not modify grades; that's the `AssessmentEvaluator`'s domain.

## Pitfalls
- Duplicate student records.
- Incomplete birth dates causing age-grade mismatches.
