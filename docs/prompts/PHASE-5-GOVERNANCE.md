# Phase 5 Implementation Prompt: Governance & Proactive Auditing

## 🎯 Objective
Finalize the platform's reliability and security through **PBAC Governance** and **Autonomous Proactive Auditing**. Your goal is to implement the "Executive Oversight" of the Agentic School.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **PBAC SECURITY**: Evaluation MUST happen *before* any tool execution.
- **EDGE-NATIVE EVALUATION**: Policies must be evaluated on the Cloudflare Edge (using KV for roles).
- **NO UNREVIEWED DELETES**: High-impact actions are paused for human approval.
- **TEST DRIVEN**: The agent MUST run and pass automated testing (unit/integration) before completing this phase.
- **GIT COMMIT**: The agent MUST create a standard git commit with AI attribution before signing out.
- **SCOPE LOCK**: Do NOT modify files or domains outside the explicit scope of this phase.
- **ESCALATION PROTOCOL**: If you encounter missing context, undocumented relations, or ambiguity, DO NOT HALLUCINATE. Pause and request clarification via `notify_user`.
- **STRICT TYPECHECK**: Run `pnpm tsc --noEmit` on all modified files. You must resolve all TypeScript errors before signing out.
- **EXECUTION PLAN**: Before writing code, you MUST create a localized `docs/plans/phase-5-governance-plan.md` detailing the precise files you will create/modify.

## 📦 Required Context & Skills
- **Spec**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 16, Section 44).
- **Required Skills**:
  - `backend-security-coder` (PBAC edge-evaluation strategies)
  - `mastra` (Building the "Maximizer" AI Auditor agent)

## 🚀 Tasks

### 1. PBAC Evaluation Middleware
Implement the policy evaluator in `src/middleware/pbac.middleware.ts`.
- Maps `actor_id` + `action` + `resource` to a Boolean resolution.
- Uses the `domain-pbac` repository for hierarchical role caching.

### 2. Board Inbox & Governance Workflows
- Implement the "Manual Approval" pulse for high-impact agent actions.
- Any tool marked `governance: required` in the schema must pause and create a `GOVERNANCE_REQUEST` WorkProduct.

### 3. The AI Maximizer (Proactive Auditor)
Implement the **Maximizer Agent** in the IT/Ops domain.
- Background routine scanning for tool failure patterns or cost anomalies.
- Proactively raises system issues in the dashboard when thresholds are exceeded.

## 🏁 Completion Criteria
- [ ] Generated and followed a localized `docs/plans/phase-5-governance-plan.md`.
- [ ] `pnpm tsc --noEmit` strictly passed with zero errors.
- [ ] Verified blocking of unauthorized agent actions.
- [ ] Working Pause/Approve/Reject flow for the Board Inbox.
- [ ] Successful autonomous anomaly detection by the Maximizer.
- [ ] All automated tests passed.
- [ ] Code staged and committed with AI attribution.
- [ ] Update `docs/PROJECT_ROADMAP.md` (Phase 5 marked as COMPLETE).
