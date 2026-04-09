# Phase 3: Cognitive Core - Plan

**Objective:** Implement the core HMAS arbitration logic, recursive memory summarization, and dynamic tool-registry integration.

## Acceptance Criteria (UAT)

- [ ] **Arbitration**: The Principal agent correctly routes a multi-domain request (e.g., "Pay tuition and check enrollment") to both Finance and Academic supervisors.
- [ ] **Memory Integrity**: A summary is generated and persisted in `domain-ai` after every task completion.
- [ ] **Context Recall**: Agents can retrieve and use state from previous tasks via the summary-injection layer.
- [ ] **Tool Security**: A Supervisor for `it` is rejected if it attempts to call `postFinanceEntry`.
- [ ] **Orchestration Speed**: Principal dispatcher reasoning completes in <2s using the optimized LLM provider.

## Implementation Steps

### 1. Principal Dispatcher & SOUL
- **Plan**: `plans/01-principal-dispatcher.md`
- **Focus**: LLM-based goal decomposition and `SOUL.md` alignment.

### 2. Recursive Memory Ledger
- **Plan**: `plans/02-memory-ledger.md`
- **Focus**: Task-completion triggers and summarization loop.

### 3. Dynamic Registry & Injection
- **Plan**: `plans/03-dynamic-registry.md`
- **Focus**: Scoped tool discovery and domain supervisor vetting.

---

*Phase: 03-role-library-hmas*
*Plan created: 2026-04-09*
