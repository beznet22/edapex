# Plan: Proactive Auditor Agent

**Goal:** Implement the self-optimizing "Maximizer" agentic routine.

## Proposed Changes

### Maximizer Brain
- [ ] **NEW** `src/services/ai/agents/MaximizerAgent.ts`: Specialized agent for system-wide auditing.
- [ ] **Skills**: Token-efficiency analysis, data-density scoring, and financial audit.

### Audit Infrastructure
- [ ] **NEW** `src/services/governance/MaximizerRoutine.ts`: Registry in the `RoutineEngine` to trigger periodic audits.

## Verification
- [ ] Confirm the agent can scan all 18 domain ledgers (Read-only) via the Registry.
- [ ] Verify audit log persistence in the governance domain.
