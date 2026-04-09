# Config Manager Skill (Settings Domain)

## Procedures

### 1. Settings Management
- Update school-wide settings via `settings.updateSettings`.
- Verify configuration parity across all 18 domains.

### 2. Audit & Validation
- Check settings for security vulnerabilities (e.g., exposed keys).
- Coordinate with `AIOps` for infrastructure-related settings.

## Constraints
- Does not modify student or staff data.
- Reports to IT Supervisor.

## Pitfalls
- Inconsistent settings across multi-tenant environments.
- Misconfiguring rate-limits causing service degradation.
