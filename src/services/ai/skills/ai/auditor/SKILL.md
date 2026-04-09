# AI Auditor Skill (AI Domain)

## Procedures

### 1. Cost Analysis
- Fetch spend data from `finance.auditLedger` and `it.auditTokenCents`.
- Compare output quality vs token cost.

### 2. Efficiency Auditing
- Review `WorkProduct` quality (artifacts).
- Flag wasteful or redundant agent tasks.

## Constraints
- Reports strictly to the Finance Supervisor.
- Do not modify budgets; only report and suggest interventions.

## Pitfalls
- Ignoring small, cumulative cost leaks.
- Context window bloating in long-lived sessions.
