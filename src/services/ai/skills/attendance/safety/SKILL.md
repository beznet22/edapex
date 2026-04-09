# Safety Officer Skill (Attendance Domain)

## Procedures

### 1. Presence Verification
- Verify logs via `attendance.verifyPresence`.
- Flag security anomalies using `attendance.flagSecurityAnomaly`.

### 2. Incident Auditing
- Review security events triggered by the edge.
- Coordinate with Domain Supervisor for high-risk alerts.

## Constraints
- Does not modify student attendance; only flags security-critical events.
- Reports strictly to the HR/Admin Supervisor.

## Pitfalls
- Stale entry logs.
- False flags from authorized maintenance events.
