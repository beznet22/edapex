# PBAC Compliance Skill (PBAC Domain)

## Procedures

### 1. Access Auditing
- Verify permissions using the `PBAC` evaluation engine.
- Check that `tenant_id` filters are present in all database interactions.

### 2. Policy Enforcement
- Flag unauthorized tool usage.
- Review `WorkProduct` metadata for PII leaks.

## Constraints
- Does not modify data; only audits and flags violations.
- Reports to IT Supervisor.

## Pitfalls
- False positives in complex multi-tenant scenarios.
- Overlooking subtle IDOR-style vulnerabilities.
