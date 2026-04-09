# Plan: Principal Dispatcher & SOUL

**Goal:** Implement the top-level HMAS arbiter guided by the platform soul.

## Proposed Changes

### Orchestration core
- [ ] **NEW** `src/services/ai/PrincipalAgent.ts`: The central HMAS agent.
- [ ] **Logic**: Receives user intent, decomposes into sub-goals, and identifies matching Domain Supervisors.
- [ ] **Alignment**: Inject `src/services/ai/strategy/SOUL.md` into the system instructions.

### Routing Logic
- [ ] **NEW** `src/services/ai/Dispatcher.ts`: LLM-based classifier that returns a JSON list of required domain supervisor IDs for a given prompt.

## Verification
- [ ] `pnpm vitest run src/services/ai/PrincipalAgent.test.ts`
- [ ] Verify multi-domain goals are correctly partitioned.
