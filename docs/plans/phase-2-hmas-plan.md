# Phase 2: HMAS & Specialized Role Library - Implementation Plan

## 🎯 Objective
Deploy the "Brain" of the EdApex V2 Agentic School by implementing the Hierarchical Multi-Agent System (HMAS). This includes the `PrincipalAssistant`, 18 Domain Supervisors, and 31+ specialized Task Agents using the Mastra SDK, while ensuring edge-native resilience and strict tenant isolation.

## 📜 Technical Strategy

### 1. The Executive Orchestrator (`PrincipalAssistant`)
- **Location**: `src/services/ai/principal.service.ts`
- **Pattern**: Principal Assistant -> Domain Supervisors -> Task Agents.
- **Boot Sequence**: Load Structural Skills (e.g., 6-3-3-4), Policy Skills, and Academic Calendar into context.
- **Goal Decomposition**: Recursive goal creation (`institution` -> `department` -> `agent` -> `task`).

### 2. Specialized Role Library (31+ Agents)
- **Base Agent**: Implement a `BaseAgent` class/factory to handle common Mastra tool registration and tenant-isolation filters.
- **Domain Registries**:
    - **Academic**: Registrar, HOD, Assessment Evaluator.
    - **Finance**: Bursar, Accountant, AI Auditor.
    - **HR/Admin**: HR Manager, Compliance Officer, PR Officer.
    - **Classroom**: Director, Teacher, Evaluator.
    - (Complete list for all 18 domains from Section 13 of spec).
- **Location**: `src/services/ai/roles/{domain}/`

### 3. Orchestration & Resilience (The "Pulse")
- **Standard Adapter Registry**: Unified adapter for provider-agnostic execution (Workers AI, OpenAI, Anthropic).
- **PII Obfuscation**: Middleware to tokenize names/PII before LLM dispatch.
- **Session Compaction**: `MemoryService` for boundary-aware dual-stage compression at 85% and 50% window thresholds.
- **Atomic Checkout**: Enforce single-trip SQL update pattern in `AIService` for task acquisition.

### 4. Classroom Domain (LangGraph)
- **Director Agent**: LangGraph traffic controller (`directorNode`) orchestrating the state machine.
- **Teacher Agent**: SSE-based pedagogical instruction with interleaved board/chat JSON.
- **Evaluator Agent**: Passive grading and RAG token compaction.

## 📦 Unit Tasks

### Foundation & Registry
- [ ] Initialize `src/services/ai/roles/` directory structure.
- [ ] Implement `ProviderRegistry` and `FallbackManager` in `src/services/ai/strategy/provider.ts`.
- [ ] Implement `PIIObfuscator` middleware in `src/services/ai/middleware/pii.ts`.
- [ ] Initialize `src/services/ai/strategy/SOUL.md` and map sub-personas.

### Executive Orchestration
- [ ] Implement `PrincipalAssistant` in `src/services/ai/principal.service.ts`.
- [ ] Implement `GoalDecomposer` logic using `aiGoals` repository.
- [ ] Register core supervisors in `src/services/ai/strategy/registry.ts`.

### Specialized Agents (Iterative Deployment)
- [ ] **Academic Domain Agents**: Registrar, HOD.
- [ ] **Finance Domain Agents**: Bursar, Accountant, AI Auditor.
- [ ] **HR Domain Agents**: HR Manager, Compliance Officer.
- [ ] **Classroom Domain Agents**: Director, Teacher, Evaluator.
- [ ] (Continue for all 31+ roles).

### Verification
- [ ] `pnpm tsc --noEmit` validation for all new agent definitions.
- [ ] Atomic Task Checkout stress test (simulated concurrency).
- [ ] Goal Decomposition trace audit.

## 🏁 Completion Criteria
- 31+ Agent definitions verifiable via Mastra.
- Zero-error tool registration across all 18 domains.
- Layer 1 Resilience verified for `recursive_loop_breaker` and `context_window_throttler`.
- Phase 2 marked as COMPLETE in `docs/PROJECT_ROADMAP.md`.

Signed-off-by: Beznet <[EMAIL_ADDRESS]>
Co-Authored-By: Antigravity <antigravity@google.com>
