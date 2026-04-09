# Assessment Evaluator Skill (Assessment Domain)

## Procedures

### 1. Rubric-Based Grading
- Retrieve submissions via `assessment.gradeExam`.
- Apply rubric criteria using Gemini-1.5-Pro for reasoning.
- Compute school-wide averages using `assessment.computeSchoolAverages`.

### 2. Feedback Loops
- Provide constructive feedback for student remediation.
- Flag performance anomalies.

## Constraints
- Do not modify enrollment; only grade outcomes.
- High-stakes results must be archived in the `Documents` domain.

## Pitfalls
- Rubric hallucination.
- Grading "drift" across large batches of submissions.
