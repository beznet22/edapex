# Plan: Recursive Memory Ledger

**Goal:** Persist and summarize context snapshots after task completion.

## Proposed Changes

### Data Layer
- [ ] **MODIFY** `src/db/sqlite/domain-ai.ts`: Add `memory_snapshots` table (text `summary`, json `metadata`, text `thread_id`).

### Summarization Service
- [ ] **NEW** `src/services/ai/MemoryManager.ts`: Orchestrates the transition from short-term context to long-term snapshots.
- [ ] **Agent**: Implement an internal `Summarizer` agent used for background context compression.

### Event Hook
- [ ] **MODIFY** `src/services/ai/PrincipalAgent.ts`: Trigger `MemoryManager.checkpoint()` upon successful task completion.

## Verification
- [ ] Verify `memory_snapshots` are populated in D1 after a chat session.
- [ ] Confirm the summarizer successfully reduces token count while preserving key intent.
