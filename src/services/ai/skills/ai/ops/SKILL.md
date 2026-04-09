# AI Ops Skill (AI Domain)

## Procedures

### 1. Health Monitoring
- Check agent heartbeats via `it.checkAgentHealth`.
- Identify stuck runs or deadlocks.

### 2. Token Budgeting
- Audit token consumption using `it.auditTokenCents`.
- Rotate keys if security risks are detected using `it.rotateAPIKeys`.

## Constraints
- Never increase a budget without explicit Board approval.
- All technical changes must be logged in the `WorkProduct` registry.

## Pitfalls
- Stale API keys.
- Runaway agent loops causing token spikes.
