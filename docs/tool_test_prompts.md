# Mastra Tool Test Prompts

Use these concise prompts to test the various Mastra AI agents and tools.

## Onboarding Tools (`onboard-entity`, `assign-entity`)
- `/onboard student: John Doe, Male, DAYCARE. Guardian: Jane Doe (Mother), 555-0101, jane@example.com to Class 1, Section 1.`
- `/assign student ID 42 to Class 2, Section 3.`
- `/onboard new guardian Peter Smith (Father) for student ID 15, phone 555-9999, peter@test.com.`

## Governance Tools (`patch-entity`, `manage-access`)
- `/patch student ID 10 change category to PRIMARY.`
- `/suspend student ID 25 for 3 days.`
- `/reset password for staff ID 7.`

## Grading Tools (`manage-results`)
- `/mark student ID 12 got 85 in subject ID 4.`
- `/attendance student ID 12 was present 40 days, absent 2 days.`
- `/behavior student ID 12 rating 5 for Punctuality.`

## Core Tools (`search-entity`, `switch-workspace`, `system-status`)
- `/search student named "Alice"`
- `/switch to class 5 section 2.`
- `/status check current system health.`

## Workflow Tools (`extract-data`, `validate-data`, `publish-data`)
- `/extract key entities from the last document.`
- `/validate the extracted student records format.`
- `/publish the approved grading report.`
