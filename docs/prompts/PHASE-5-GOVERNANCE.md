# Phase 5 Implementation Prompt: Governance & Proactive Auditing

## 🎯 Objective
Finalize the platform's reliability and security through **PBAC Governance** and **Autonomous Proactive Auditing** while performing an exhaustive **Verify, Align, and Enhance** audit of the platform's security boundaries. Your goal is to implement the "Executive Oversight" of the Agentic School, ensuring 100% architectural parity with Paperclip's (located at `/home/beznet/Workspace/paperclip`) proven governance and auditing patterns.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **IDEMPOTENT VERIFICATION & DISCOVERY LOOP**: This prompt is designed for continuous refinement. Every execution MUST:
    1. **Exhaustive Discovery**: Systematically crawl the Paperclip codebase (`/home/beznet/Workspace/paperclip`) to identify all relevant security middleware, PBAC evaluation logic, and proactive auditing patterns. Use Paperclip's [src/middleware/](/home/beznet/Workspace/paperclip/server/src/middleware/) and [src/services/costs.ts](/home/beznet/Workspace/paperclip/server/src/services/costs.ts) as high-signal **suggestions**, but do not limit your search to them.
    2. **Audit**: Compare the discovered Paperclip governance logic against existing EdApex code (e.g., `src/middleware/pbac.middleware.ts`, `src/services/ai/auditor.service.ts`).
    3. **Align & Enhance**: Refine the PBAC evaluation, proactive troubleshooting (Maximizer Agent), and forensic audit shells to reach 100% parity with Paperclip's patterns.
- **ATOMIC PROGRESS LOGGING**: Your execution plan (e.g., `docs/plans/phase-5-governance-plan.md`) MUST include a granular `Unit Tasks` checklist. You MUST update this checklist as you complete each task. This ensures the next agent can seamlessly resume work by referencing `docs/PROJECT_ROADMAP.md` and your plan's progress state.
- **NO COPY-PASTE**: Reconstruct Paperclip's logic into EdApex-native patterns (Hono Middleware, Drizzle Repositories).
- **PBAC SECURITY**: Evaluation MUST happen *before* any tool execution.
- **PROACTIVE AUDITING**: Implement the **Maximizer Agent** to proactively scan for systemic stressors (deadlocks, amnesia).

## 📦 Required Context & Skills
- **Spec**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 16, Section 42).
- **Stress Framework**: [STRESS_FRAMEWORK.md](../STRESS_FRAMEWORK.md) (ALL categories — this phase validates the entire framework).
- **Domain Specs** (MANDATORY — governance touches all 18 domains):
  - [pbac.md](../domains/pbac.md): Policy definitions, role assignments, evaluation tools, guardian access filters, audit integrity verification.
  - [events.md](../domains/events.md): Audit log, event outbox, replay engine, tampering detection.
  - [ai.md](../domains/ai.md): Agent actions, tool invocations, token budget enforcement.
  - [classroom.md](../domains/classroom.md): Stream-time PBAC, memory ledger, escalation protocol.
  - ALL other domain docs: Each lists `[STRESS DEFENSE]` tools that must survive the Layer 2 Stress Testing suite.
- **STRESS TEST MANDATE**: The `load_test_simulator` and `chaos_mesh` scenarios MUST exercise ALL `[STRESS DEFENSE]` tools listed across all 18 domain docs. The domain docs are the canonical inventory of stressors to test against.
- **Required Skills**:
  - `backend-security-coder` (PBAC edge-evaluation strategies)
  - `mastra` (Building the "Maximizer" AI Auditor agent)

## 🚀 Tasks

### 1. PBAC Evaluation Middleware
Implement the policy evaluator in `src/middleware/pbac.middleware.ts`.
- Maps `actor_id` + `action` + `resource` to a Boolean resolution.
- Uses the `domain-pbac` repository for hierarchical role caching.

### 2. Board Inbox & Governance Workflows
- Implement the "Manual Approval" pulse for high-impact agent actions using the `aiApprovals` schema.
- Any tool marked `governance: required` in the schema must pause and create a `PENDING` record in `ai_approvals`.
- HMITL (Human-in-the-loop) triggers: The `HITL_trigger_router` must map approval decisions back to the blocked `aiTask`.

### 3. The AI Maximizer & Auditor Agents
Implement the **Maximizer Agent** and the **Auditor Agents** for proactive issue tracking.
- **Auditor Agent**: Scans `ai_cost_events` and `ai_activity_logs` for failures, token drift, or over-budget operations.
- **Forensic Trace**: Implement the binary-locked audit trail (Section 10.3) where every goal/task mutation is logged to `aiActivityLogs`.
- **Memory Compactor**: Implement the char-count audit (80% warning / 95% compaction) for all 3-tier memory buffers (Section 44).
- **Stress Lab Integration**: When an anomaly is detected, the Auditor "snaps" the tenant state to the **EdApex Stress Lab** (`MODE=STRESS_LAB`) to run isolated diagnostics.
- **[STRESS DEFENSE]** `load_test_simulator`: Simulates multi-tenant peak logins (e.g. 5k concurrent users).
- **[STRESS DEFENSE]** `chaos_mesh`: Injects network partitions and DB nodes failures during live agent runs.
- **[STRESS DEFENSE]** `audit_log_integrity_verifier`: Detects attempted tampering of the PBAC audit trail.

## 🏁 Completion Criteria
- [ ] Generated and followed a localized `docs/plans/phase-5-governance-plan.md`.
- [ ] `pnpm tsc --noEmit` strictly passed with zero errors.
- [ ] Verified blocking of unauthorized agent actions and **Audit Log Integrity** against tampering stressors.
- [ ] Successful completion of Layer 2 Stress Testing (Load + Chaos), including verification of the **Auditor Agent**'s forensic trace across costs and activity.
- [ ] Working Pause/Approve/Reject flow for the Board Inbox via `HITL_trigger_router`.
- [ ] All automated tests passed.
- [ ] Code staged and committed with AI attribution.
- [ ] Update `docs/PROJECT_ROADMAP.md` (Phase 5 marked as COMPLETE).

### 4. Stream-Time PBAC Interception (Agentic Classroom)
Implement real-time security enforcement for the live Classroom SSE pipeline.
- **Partial-JSON Interceptor**: As the LangGraph engine yields incremental JSON `action` payload arrays over the `/api/classroom/sse` stream, a PBAC stream interceptor must regex-match and validate each `action` element against the policy engine *before* the corresponding Mastra tool is invoked.
- **Inline 403 Signaling**: If an unauthorized tool payload is detected within the stream (e.g., a Teacher Agent attempting a Finance-domain tool), the interceptor forcibly yields a `403` signal to the edge and halts external execution boundaries immediately—without terminating the entire SSE connection.
- **Audit Trail**: Every intercepted violation must generate a `SECURITY_INCIDENT` WorkProduct and fire an `ON_PBAC_VIOLATION` event to the Board Command Center.
- **Spec Reference**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 10.4).
