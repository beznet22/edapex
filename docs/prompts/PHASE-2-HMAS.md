# Phase 2 Implementation Prompt: HMAS & Specialized Role Library

## 🎯 Objective
Deploy the "Brain" of the EdApex V2 Agentic School. Map the strategic HMAS orchestration (Principal Assistant) and the 31+ specialized Staff Roles documented in the spec, while iteratively performing a **Verify, Align, and Enhance** audit against Paperclip's (located at `/home/beznet/Workspace/paperclip`) proven agentic patterns.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **IDEMPOTENT VERIFICATION & DISCOVERY LOOP**: This prompt is designed for continuous refinement. Every execution MUST:
    1. **Exhaustive Discovery**: Perform a comprehensive analysis of the Paperclip codebase (located at `/home/beznet/Workspace/paperclip`) to identify all relevant agent roles, orchestration patterns, and skill definitions. Use files like [agents.ts](/home/beznet/Workspace/paperclip/server/src/services/agents.ts) and [SKILL.md](/home/beznet/Workspace/paperclip/skills/paperclip/SKILL.md) as high-signal **suggestions**, but do not limit your search to them.
    2. **Audit**: Compare the discovered Paperclip patterns against existing EdApex Agent/Workflow definitions in `src/services/ai/`.
    3. **Align & Enhance**: Refine the orchestration logic, provider fallbacks, and tool mappings to reach 100% parity with Paperclip's patterns while maximizing reuse of the Mastra SDK.
- **ATOMIC PROGRESS LOGGING**: Your execution plan (e.g., `docs/plans/phase-2-hmas-plan.md`) MUST include a granular `Unit Tasks` checklist. You MUST update this checklist as you complete each task. This ensures the next agent can seamlessly resume work by referencing `docs/PROJECT_ROADMAP.md` and your plan's progress state.
- **NO COPY-PASTE**: Reconstruct Paperclip's logic into EdApex-native patterns (`BaseController`, `IRepository<T>`, `Service`).
- **HIGH-FIDELITY REFERENCES**:
    - **Skill Blueprint**: [SKILL.md](/home/beznet/Workspace/paperclip/skills/paperclip/SKILL.md)
    - **Model Adapters**: [/home/beznet/Workspace/paperclip/packages/adapters/](/home/beznet/Workspace/paperclip/packages/adapters/)
    - **UI Adapters**: [registry.ts](/home/beznet/Workspace/paperclip/ui/src/adapters/registry.ts)
    - **Runtime State**: [agent_runtime_state.ts](/home/beznet/Workspace/paperclip/packages/db/src/schema/agent_runtime_state.ts)
- **MASTRA SDK**: All agents must be defined using the Mastra SDK (`Agent` and `Workflow` classes).
- **SKILL-AS-A-STRUCTURE**: Implement the "Structure-as-a-Skill" pattern. Educational constructs and policies are loaded as AI Skills.
- **TENANT ISOLATION**: Every query must include a `tenant_id` filter.
- **PERSONA-CENTRIC FLOWS**: Before defining agents, update [docs/domains/](../domains/) documentation with a "Professional Persona Flow" narrative.
- **EXECUTION PLAN**: Create `docs/plans/phase-2-hmas-plan.md` before writing code.

## 📦 Required Context & Skills
- **Spec**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Sections 11.2, 13, 36, 46).
- **Stress Framework**: [STRESS_FRAMEWORK.md](../STRESS_FRAMEWORK.md).
- **Domain Specs** (MANDATORY — read ALL before defining agents and tools):
  - [core.md](../domains/core.md): Identity, tenancy, personas, academic years.
  - [academic.md](../domains/academic.md): Classes, sections, subjects, routines, promotions.
  - [assessment.md](../domains/assessment.md): Exams, grading, results, report cards.
  - [attendance.md](../domains/attendance.md): Unified attendance records.
  - [finance.md](../domains/finance.md): Ledger, fees, payments, invoicing.
  - [lms.md](../domains/lms.md): Courses, lessons, assignments, AI tutoring, learning paths.
  - [hr.md](../domains/hr.md): Leave, payroll, evaluations.
  - [facilities.md](../domains/facilities.md): Transport, dormitories, inventory, complaints.
  - [ai.md](../domains/ai.md): Chat, agents, actions, tool invocations.
  - [classroom.md](../domains/classroom.md): Sessions, memory ledger, whiteboard, participants.
  - [homeschooling.md](../domains/homeschooling.md): Subscriptions, portfolios, schedules, revenue.
  - [library.md](../domains/library.md): Books, issues, borrower profiles.
  - [pbac.md](../domains/pbac.md): Policies, role assignments, policy bindings.
  - [communication.md](../domains/communication.md): Multi-channel dispatch, recipient tracking.
  - [events.md](../domains/events.md): Domain events, audit log, outbox.
  - [settings.md](../domains/settings.md): Config, feature flags.
  - [cms.md](../domains/cms.md): Content nodes, navigation.
  - [documents.md](../domains/documents.md): Polymorphic file storage.
- **TOOL MANDATE**: Each domain doc lists operational tools AND `[STRESS DEFENSE]` tools in the "AI Task Agents & Tools" section. When defining agents for a domain, ALL listed tools MUST be registered as Mastra tool definitions. The domain docs are the canonical source — tools there are not optional.
- **AGENT REGISTRY**: Each domain doc has an "HMAS Agent Registry" table. Use these as the definitive agent definitions per domain.
- **Target Domains**: ALL 18 Domains (including Classroom).
- **Required Skills**:
  - `mastra` (Strict usage of Agent and Workflow abstractions)
  - `multi-agent-patterns` (Principal -> Supervisor -> Task Agent hierarchy)
  - `ai-agents-architect` (Tool creation and validation)

## 🚀 Tasks

### 1. The Executive Orchestrator
Implement the `PrincipalAssistant` in `src/services/ai/principal.service.ts`.
- **Skill Load**: At boot, load the tenant's exact **Structural Skill** (e.g. 6-3-3-4), **School Policy Skills**, and **Academic Calendar** into the orchestration context.
- **Goal Decomposition**: Decomposes high-level goals into recursive `aiGoals` (institution -> department -> agent -> task) using the `createGoal` repository method.
- **Session Lineage**: Maintain strict session propagation using `parent_session_id` to ensure forensic auditability of sub-agent calls.

### 2. The Staff Role Library
Generate the 31+ specialized agent definitions in `src/services/ai/roles/`.
- **Registrar (Academic)**: Manages student enrollments and records.
- **Bursar (Finance)**: Handles fee collection and budget tracking.
- **HR Manager (HR)**: Staff management and payroll verification.
- (Implement ALL roles from Section 13 of the spec).

### 3. Agent Registry & Skill Mapping
- Register the Executive and Supervisors in `src/services/ai/strategy/registry.ts`.
- **Toolset Grouping**: Enforce least-privilege by mapping domain-specific toolsets to each Supervisor.
- **System + 3 Assembly**: [HIGH-FIDELITY] Implement the `prompt-builder.ts` with strict assembly order and Anthropic-style cache breakpoints (Section 1-46 as Breakpoint 1).
- **Memory Tools**: Implement the `memory_tool` (`add`, `replace`, `remove`) for all 3-tier buffers (Section 44).
- **Strategic Providers**: Implement the dynamic `ProviderRegistry` and `FallbackManager` (Workers AI, OpenAI, Anthropic, Ollama) within the Orchestrator with smart routing and mid-session failover (Section 46).
- **Personality (SOUL)**: Initialize the `src/services/ai/strategy/SOUL.md` and map supervisor sub-personas in the registry.
- **Atomic Task Checkout**: Implement the logic to consume `ai_tasks` using the single-trip `checkoutTask` repository method to ensure race-condition-free concurrency in Edge environments (Section 11.2).
- **Background Protocol**: Implement the `session_id` tracking for high-latency tools (e.g., bulk enrollment).
- Initialize the `src/services/ai/skills/` directory for the active domain.
- **[STRESS DEFENSE]** `skill_integrity_lock`: Prevents accidental overwriting of agent-managed skills during concurrent runs.

## 🏁 Completion Criteria
- [ ] Generated and followed a localized `docs/plans/phase-2-hmas-plan.md`.
- [ ] `pnpm tsc --noEmit` strictly passed with zero errors.
- [ ] **Atomic Asset Checkout**: Implementation of the single-trip SQL update pattern (Section 11.2) for task acquisition.
- [ ] 31+ Agent definitions verifiable via Mastra.
- [ ] Zero-error tool registration across all 18 domains.
- [ ] Goal decomposition trace verifiable through logs, including Skill-based constraints.
- [ ] Layer 1 Resilience verified for `recursive_loop_breaker` (verified against **Infinite Agent Loops**) and `context_window_throttler` (verified against **Context Window Overflow** using Hermes-grade compression).
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
- **Spec Reference**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 5.4, 11.6, 13.18).
