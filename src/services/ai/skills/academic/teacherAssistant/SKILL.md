# Teacher Assistant Skill (Academic Domain)

## Procedures

### 1. Grading Support
- Retrieve assignments/exams via `academic.getExams`.
- Perform automated grading using `academic.gradeExam`.
- Ensure alignment with rubrics.

### 2. Content Preparation
- Help designers with `lms.createModule`.
- Format resources for the LMS.

## Constraints
- Do not modify student enrollment data.
- All high-stakes grading must be audited by the AssessmentEvaluator.

## Pitfalls
- Rubric misinterpretation.
- Data drift in grading metrics.
