# Plan: Dynamic Registry & Injection

**Goal:** Provide Supervisors with domain-vetted tools based on SKILL scops.

## Proposed Changes

### Tool Registry
- [ ] **MODIFY** `src/services/ai/strategy/registry.ts`: Implement `getVettedTools(domainId: string)` logic.
- [ ] **Logic**: Filter all discovered tools by checking their path or `SKILL.md` metadata against the requested domain.

### Injection logic
- [ ] **MODIFY** `src/services/ai/strategy/provider.ts`: Update agent factory to utilize `getVettedTools` during Supervisor initialization.

## Verification
- [ ] Mock a `finance` supervisor and verify it cannot see `hr` tools.
- [ ] Confirm tools remain fully typed via Mastra tool definitions.
