# Phase 2 Implementation Prompt: HMAS & Specialized Role Library

## 🎯 Objective
Deploy the "Brain" of the Agentic School. Map the strategic HMAS orchestration (Principal Assistant) and the 31+ specialized Staff Roles documented in the spec.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **MASTRA SDK**: All agents must be defined using the Mastra SDK (`Agent` and `Workflow` classes).
- **TOOL INTEGRITY**: Tools must be validated against JSON schemas and mapped 1:1 to the 18 `IRepository<T>` domain interfaces (including Domain 18: Classroom).
- **HIERARCHICAL FLOW**: Principal Assistant decomposes goals -> Domain Supervisors oversee silos -> Task Agents execute specialized tools.
- **TEST DRIVEN**: The agent MUST run and pass automated testing (unit/integration) before completing this phase.
- **GIT COMMIT**: The agent MUST create a standard git commit with AI attribution before signing out.
- **SCOPE LOCK**: Do NOT modify files or domains outside the explicit scope of this phase.
- **ESCALATION PROTOCOL**: If you encounter missing context, undocumented relations, or ambiguity, DO NOT HALLUCINATE. Pause and request clarification via `notify_user`.
- **STRICT TYPECHECK**: Run `pnpm tsc --noEmit` on all modified files. You must resolve all TypeScript errors before signing out.
- **EXECUTION PLAN**: Before writing code, you MUST create a localized `docs/plans/phase-2-hmas-plan.md` detailing the precise files you will create/modify.

## 📦 Required Context & Skills
- **Spec**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Sections 13 and 36, Role Library & Domains).
- **Domain Specs**: Read `docs/domains/*.md` (especially `ai.md` and `classroom.md`) for low-level technical execution details.
- **Target Domains**: ALL 18 Domains (including Classroom).
- **Required Skills**:
  - `mastra` (Strict usage of Agent and Workflow abstractions)
  - `multi-agent-patterns` (Principal -> Supervisor -> Task Agent hierarchy)
  - `ai-agents-architect` (Tool creation and validation)

## 🚀 Tasks

### 1. The Executive Orchestrator
Implement the `PrincipalAssistant` in `src/services/ai/principal.service.ts`.
- Handles high-level goals (e.g., "Scale the Academic Program").
- Decomposes into `SubGoals` for Domain Supervisors (Academic Head, Bursar).

### 2. The Staff Role Library
Generate the 31+ specialized agent definitions in `src/services/ai/roles/`.
- **Registrar (Academic)**: Manages student enrollments and records.
- **Bursar (Finance)**: Handles fee collection and budget tracking.
- **HR Manager (HR)**: Staff management and payroll verification.
- (Implement ALL roles from Section 13 of the spec).

### 3. Cross-Domain Tooling
- Register the toolset for each agent in the `StandardAdapterRegistry`.
- Ensure each tool is wrapped in a **Zod Validator** before execution.

## 🏁 Completion Criteria
- [ ] Generated and followed a localized `docs/plans/phase-2-hmas-plan.md`.
- [ ] `pnpm tsc --noEmit` strictly passed with zero errors.
- [ ] 31+ Agent definitions verifiable via Mastra.
- [ ] Zero-error tool registration across all 18 domains.
- [ ] Goal decomposition trace verifiable through logs.
- [ ] All automated tests passed.
- [ ] Code staged and committed with AI attribution.
- [ ] Update `docs/PROJECT_ROADMAP.md` (Phase 2 marked as COMPLETE).

### 4. Privacy & Operator Controls
- Implement an automated PII Obfuscation Middleware to pre-process LLM queries before standard payload generation mapping.
- Ensure all B2C Sub-Agents contain an explicit `request_human_operator` tool, pausing execution and handing off the `thread_id` to standard operators.

### 5. Agentic Classroom Agent Definitions
Define the 3 specialized Classroom agents in `src/services/ai/roles/classroom/`:
- **Director Agent**: LangGraph traffic controller (`directorNode`). Tools: `stream_event`, `assign_turn`, `end_session`. Orchestrates the `createOrchestrationGraph()` state machine.
- **Teacher Agent**: Pedagogical content delivery. Tools: `wb_highlight`, `wb_show_image`, `wb_pan`, `wb_spotlight`. Generates interleaved `action`/`text` JSON arrays for SSE streaming.
- **Evaluator Agent**: Passive grading and RAG token compaction. Tools: `eval_turn`, `compress_memory`, `generate_grading_report`. Produces `WorkProduct` records from live session data.
- **Escalation**: Wire the human escalation edge (`type: "escalation"`) so administrators can halt the LangGraph loop and assume direct control.
- **Spec Reference**: [AGENTIC_CLASSROOM_V2_SPEC.md](../AGENTIC_CLASSROOM_V2_SPEC.md) (Sections 1-3) and [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 5.4, 13.18).
