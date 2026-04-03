# Phase 5 Implementation Prompt: Governance & Proactive Auditing

## 🎯 Objective
Finalize the platform's reliability and security through **PBAC Governance** and **Autonomous Proactive Auditing**. Your goal is to implement the "Executive Oversight" of the Agentic School.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **PBAC SECURITY**: Evaluation MUST happen *before* any tool execution.
- **PROACTIVE AUDITING**: Implement the **Maximizer Agent** to proactively scan for systemic stressors (deadlocks, amnesia).
- **EDGE-NATIVE EVALUATION**: Policies must be evaluated on the Cloudflare Edge.
- **NO UNREVIEWED DELETES**: High-impact actions are paused for human approval via the `HITL_trigger_router`.
- **LAYER 2 RESILIENCE**: The phase is not complete until the platform survives the `load_test_simulator` and `chaos_mesh` scenarios.
- **TEST DRIVEN**: The agent MUST run and pass automated testing (unit/integration) before completing this phase.
- **GIT COMMIT**: The agent MUST create a standard git commit with AI attribution before signing out.
- **SCOPE LOCK**: Do NOT modify files or domains outside the explicit scope of this phase.
- **ESCALATION PROTOCOL**: If you encounter missing context, undocumented relations, or ambiguity, DO NOT HALLUCINATE. Pause and request clarification via `notify_user`.
- **STRICT TYPECHECK**: Run `pnpm tsc --noEmit` on all modified files. You must resolve all TypeScript errors before signing out.
- **PERSONA-CENTRIC COMPLIANCE**: Define the "Professional Persona Flow" for the Compliance Officer and Auditor. Describe how systemic stressors are monitored and resolved in the Command Center UI using descriptive narratives.
- **EXECUTION PLAN**: Before writing code, you MUST create a localized `docs/plans/phase-5-governance-plan.md` detailing the precise files you will create/modify.

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
- [ ] Verified blocking of unauthorized agent actions and audit integrity.
- [ ] Successful completion of Layer 2 Stress Testing (Load + Chaos).
- [ ] Working Pause/Approve/Reject flow for the Board Inbox via `HITL_trigger_router`.
- [ ] All automated tests passed.
- [ ] Code staged and committed with AI attribution.
- [ ] Update `docs/PROJECT_ROADMAP.md` (Phase 5 marked as COMPLETE).

### 4. Stream-Time PBAC Interception (Agentic Classroom)
Implement real-time security enforcement for the live Classroom SSE pipeline.
- **Partial-JSON Interceptor**: As the LangGraph engine yields incremental JSON `action` payload arrays over the `/api/classroom/sse` stream, a PBAC stream interceptor must regex-match and validate each `action` element against the policy engine *before* the corresponding Mastra tool is invoked.
- **Inline 403 Signaling**: If an unauthorized tool payload is detected within the stream (e.g., a Teacher Agent attempting a Finance-domain tool), the interceptor forcibly yields a `403` signal to the edge and halts external execution boundaries immediately—without terminating the entire SSE connection.
- **Audit Trail**: Every intercepted violation must generate a `SECURITY_INCIDENT` WorkProduct and fire an `ON_PBAC_VIOLATION` event to the Board Command Center.
- **Spec Reference**: [AGENTIC_CLASSROOM_V2_SPEC.md](../AGENTIC_CLASSROOM_V2_SPEC.md) (Section 8) and [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 10.4).
