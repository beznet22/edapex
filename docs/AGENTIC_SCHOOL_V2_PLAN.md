# EdApex V2: The Agentic School - Master Architecture Blueprint

## Table of Contents

- [1. Document Role & Scope](#1-document-role--scope)
- [2. System Role & Autonomous Logic](#2-system-role--autonomous-logic)
- [3. Structural Alignment (Master Reference)](#3-structural-alignment-master-reference)
- [4. Domain Architecture (The 18 Modules)](#4-domain-architecture-the-18-modules)
- [5. HMAS Strategy (The Agentic Hierarchy)](#5-hmas-strategy-the-agentic-hierarchy)
- [6. Principal Assistant (The School Executive)](#6-principal-assistant-the-school-executive)
- [7. Domain Supervisors (The Module Managers)](#7-domain-supervisors-the-module-managers)
- [8. Task Agents (The Operational Workforce)](#8-task-agents-the-operational-workforce)
- [9. Governance & The Maximizer (Audit Integrity)](#9-governance--the-maximizer-audit-integrity)
- [10. PBAC Evaluation & Risk Control](#10-pbac-evaluation--risk-control)
- [11. PBAC Implementation Detail](#11-pbac-implementation-detail)
- [12. Operational Tools Registry (Mastra)](#12-operational-tools-registry-mastra)
- [13. Staff Role Library (31+ Agent Definitions)](#13-staff-role-library-31-agent-definitions)
- [14. The Financial Ledger (Pulse Component)](#14-the-financial-ledger-pulse-component)
- [15. Costs & Budget Calculus](#15-costs--budget-calculus)
- [16. Agent Execution Runs (The Heartbeat)](#16-agent-execution-runs-the-heartbeat)
- [17. The Routine Engine (Scheduling & Recovery)](#17-the-routine-engine-scheduling--recovery)
- [18. Real-Time Heartbeat Telemetry (SSE)](#18-real-time-heartbeat-telemetry-sse)
- [19. Edge Execution & Memory (Statelessness)](#19-edge-execution--memory-statelessness)
- [20. Stateless Memory Ledger (Compaction)](#20-stateless-memory-ledger-compaction)
- [21. Domain Data Consistency (Drizzle Sync)](#21-domain-data-consistency-drizzle-sync)
- [22. Cross-Domain Integrity & Events](#22-cross-domain-integrity--events)
- [23. System Self-Correction & Error Handling](#23-system-self-correction--error-handling)
- [24. Performance & Scalability (V2 Metrics)](#24-performance--scalability-v2-metrics)
- [26. Token Optimization & Delta Telemetry](#26-token-optimization--delta-telemetry)
- [27. Budget Policies & Preflight Enforcement](#27-budget-policies--preflight-enforcement)
- [28. Multi-Tenant Data Isolation (The Drizzle Layer)](#28-multi-tenant-data-isolation-the-drizzle-layer)
- [29. Migration Strategy & Paperclip Decommissioning](#29-migration-strategy--paperclip-decommissioning)
- [30. PBAC Policy Reference (JSON Schemas)](#30-pbac-policy-reference-json-schemas)
- [31. Local-First Conflict Resolution Strategies](#31-local-first-conflict-resolution-strategies)
- [32. Standardized Prompt Registry (Metadata Schema)](#32-standardized-prompt-registry-metadata-schema)
- [33. Edge Infrastructure Lifecycle (Hardware & Vitals)](#33-edge-infrastructure-lifecycle-hardware--vitals)
- [34. Stateless Heartbeat Error Recovery Matrix](#34-stateless-heartbeat-error-recovery-matrix)
- [35. V2 Integration Checklist (Developer Handover)](#35-v2-integration-checklist-developer-handover)
- [36. 18-Domain Drizzle Schema Reference (Cross-Walk)](#36-18-domain-drizzle-schema-reference-cross-walk)
- [38. Canonical Directory Structure (The 18-Domain Layout)](#38-canonical-directory-structure-the-18-domain-layout)
- [39. Implementation Detail: The Directory Flow](#39-implementation-detail-the-directory-flow)
- [41. Logging & Traceability (8-Layer Namespacing)](#41-logging--traceability-8-layer-namespacing)
- [42. Error Propagation & Resilience Pattern](#42-error-propagation--resilience-pattern)
- [43. Notification System (Toasts & Push)](#43-notification-system-toasts--push)
- [44. Proactive AI Issue Tracking](#44-proactive-ai-issue-tracking)
- [40. Conclusion: Towards the Autonomous School](#40-conclusion-towards-the-autonomous-school)


## 1. Document Role & Scope

This document is the **definitive technical specification** for transforming EdApex V2 into an autonomous "Agentic School." It serves as the concrete, build-ready contract for the V2 evolution, synthesizing Paperclip's orchestration engine, governance models, and financial ledgers into EdApex's multi-tenant, multi-dialect, Hono-driven architecture.

### 1.1 Source Inputs
- [docs/MASTER_ARCHITECTURE.md](docs/MASTER_ARCHITECTURE.md): Core system philosophy and stack.
- [docs/BUSINESS_MODEL.md](docs/BUSINESS_MODEL.md): Dual-pillar B2B/B2C alignment.
- [docs/domains/*.md](docs/domains/*.md): Domain-specific business logic and entities.
- Reference design: [https://github.com/paperclip/paperclip/blob/main/doc/SPEC-implementation.md](https://github.com/paperclip/paperclip/blob/main/doc/SPEC-implementation.md): Orchestration and heartbeat template.
- Reference design: [https://github.com/paperclip/paperclip/blob/main/doc/spec/agent-runs.md](https://github.com/paperclip/paperclip/blob/main/doc/spec/agent-runs.md): Agent runs and cost tracking.
- Reference design: [https://github.com/paperclip/paperclip/blob/main/doc/spec/agents-runtime.md](https://github.com/paperclip/paperclip/blob/main/doc/spec/agents-runtime.md): Agent runtime and cost tracking.
- Reference design: [https://github.com/paperclip/paperclip/blob/main/doc/plans/[DATE]-*.md](https://github.com/paperclip/paperclip/blob/main/doc/plans/[DATE]-*.md): Implementation plans and plus cost tracking.
- Reference design: **Stateless Graph Engine** (`director-graph.ts`, `stateless-generate.ts`): Stateless execution loop, incremental JSON parsing over SSE. [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)

### 1.2 Internal Service Architecture (Detailed)

```text
+-----------------------------------------------------------------------+
|                       UI: COMMAND CENTER (AI-ELEMENTS)                |
+-----------------------------------------------------------------------+
           ^                                         ^
           | Hono RPC (hc) / WebSockets              | TanStack DB Sync
           v                                         v
+-----------------------+                       +-----------------------+
|  VETTING & SECURITY   |                       |   TANSTACK DB STORE   |
| (Zod Validators,      |                       |   (Client Persistence)|
|  Auth/Tenant Mid)     |                       |                       |
+-----------------------+                       +-----------------------+
           |                                         ^
           v                                         |
+-----------------------+      +----------------------------------------+
|   HONO CONTROLLERS    | <--> |        MASTRA ORCHESTRATOR             |
| (BaseController)      |      | (Agents, Workflows, Prompt Engine)     |
+-----------------------+      +----------------------------------------+
           |                                         |
           +--------------------+--------------------+
                                |
           v                    v                    v
+-----------------------+ +-----------------------+ +-----------------------+
|   DOMAIN SERVICES     | |   ROUTINE ENGINE      | |   ADAPTER REGISTRY    |
| (Business Logic ACL)  | | (Cron, Event Triggers,| | (Unified Model      |
|                       | |  Atomic Checkout)     | |  Interface)         |
+-----------------------+ +-----------------------+ +-----------------------+
           |                    |                    |
           +----------+---------+----------+---------+
                      |                    |
                      v                    v
           +-----------------------+ +-----------------------+
           |   INTERNAL EVENT BUS  | |   DRIZZLE REPOSITORIES|
           | (Decoupled Handlers,  | | (IRepository<T>,      |
           |  Task Re-triggers)    | |  Tenant Isolation)    |
           +-----------------------+ +-----------------------+
                                |
                      +---------+---------+----------+
                      |                   |          |
                   [MYSQL]             [POSTGRES] [LibSQL / D1 / SQLITE]
```

## 2. Professional Layering Strategy

To ensure the Agentic School is robust and secure, it strictly adheres to the 8-layer architecture defined in [MASTER_ARCHITECTURE.md](docs/MASTER_ARCHITECTURE.md).

### 2.1 The Validator Layer (Zod)
- **Why**: Prevent malformed agent outputs or manual triggers from reaching the Drizzle repositories.
- **V2 Role**: Every Mastra tool invocation output is validated against a Zod schema *before* being committed to a WorkProduct or Domain entity.

### 2.2 The Middleware Layer (Hono Context)
- **Why**: Mandatory for `TenantGuard` and `Auth` isolation.
- **V2 Role**: Injects the active `tenant_id` and `actor_id` (Agent UUID) into the request context. This ensures that even in stateless execution, the agent never exits its school-boundary.

### 2.3 The Internal Event Bus
- **Why**: Necessary for **After-Action Decoupling**.
- **V2 Role**: Domain Services (like Assessment) emit events to the bus (e.g., `assessment.computed`) rather than calling the PR/Notification service directly. This allows agents to 'finish' their current heartbeat turn faster, staying under the 10ms CPU limit.

### 1.3 Strategic Org Chart (HMAS Visualization)

```text
       [  Principal Assistant (Executive)  ] <--- (Administrator/Board)
                  |
        +---------+---------+---------+---------+---------+
        |                   |         |         |         |
 [Academic Head]     [Bursar (Finance)] [Assessment Sup] [IT Supervisor] [HR Manager]
        |                   |             |                |                |
   +----+----+         +----+----+   +----+----+      +----+----+      +----+----+
   |         |         |         |   |         |      |         |      |         |
[Registrar][HOD]    [Acct][Payroll] [Evaluator][Proc] [AI Ops][DevOps] [PR][Safety]
```

### 1.4 Agent Heartbeat State Machine

```text
       ( Wakeup Event )
              |
              v
       [    IDLE      ] <-----------+
              |                     |
      ( Atomic Checkout )           |
              |                     |
              v                     |
       [    AWAKE     ]             |
              |                     |
      ( Context Recall )            |
              |                     |
              v                     |
       [   RUNNING    ] --( Error )--> [   ERROR   ]
              |                     ( Manual Reset )
      ( Tool Execution )
              |
     +--------+--------+
     |                 |
( Success )       ( Approval Req )
     |                 |
     v                 v
[ SUCCEEDED ]     [   PAUSED    ]
```

### 1.5 Global UI: The Command Center (Three-Pane Shell)

```text
+------+---------------------------+-----------------------------------+----------------+
| EdA  | [School Name]    [Search] | [Breadcrumbs: Home > Academics ]  | [Budget] [$]   |
| [P]  |---------------------------+-----------------------------------+----------------|
| [E]  |                           |                                   |                |
| [X]  | SIDEBAR                   | MAIN VIEWPORT                     | PROPERTY PANEL |
|      |                           |                                   |                |
| [A]  | > INBOX (Approvals)       | +-------------------------------+ | Status: Active |
| [G]  | > WORK (Board Goals)      | |                               | | Lead: Principal|
| [E]  | > DOMAINS (Supervisors)   | |      [ AI-ELEMENTS CHAT ]     | | Cost: $12.40  |
| [N]  |                           | |                               | |              |
| [T]  | -----------------         | |    (Messages / Artifacts      | | [ PROPERTIES ] |
|      |                           | |     / WorkProduct Viewer)     | | [   LIST     ] |
| [S]  | > LOGS (Activity)         | |                               | |              |
| [C]  | > FINANCE (Ledger)        | |                               | | [ TIMELINE ] |
| [H]  | > SETTINGS                | |                               | |              |
|      |                           | +-------------------------------+ |              |
+------+---------------------------+-----------------------------------+----------------+
```

### 1.6 Version Outcomes
The V2 evolution provides a complete control-plane loop for autonomous agents within an educational environment:
1. **Board Governance**: Schools (Administrators) define overarching academic and operational goals.
2. **HMAS Structure**: A Principal Assistant oversees Domain Supervisors (Academics, Finance, HR) who manage specialized Task Agents.
3. **Autonomous Execution**: Agents execute tasks via **Atomic Checkout** and **Heartbeat** cycles.
4. **Financial Accountability**: All AI activity is tracked through a double-entry ledger (`cost_events` and `finance_events`).
5. **Local-First Resilience**: Operators work in a high-performance **TanStack DB** environment with reliable background sync to Cloudflare D1, MySQL, or PostgreSQL.

## 2. Professional Code Flow Strategy

Every domain in the Agentic School follows this standardized, 5-phase execution lifecycle to ensure multi-tenant safety and fiscal accountability:

1.  **Trigger**: A signal is enqueued (Cron/Event). **Middleware** ensures the request is authenticated and tenant-scoped while initializing the **8-Layer Trace Log** (`run_id`).
2.  **Validation**: The payload is verified against a **Zod Validator** (Structural Guarantee). Any failure triggers a **Toast Notification** and logs a `fatal` error at the `validators` layer.
3.  **Checkout**: Supervisor performs an **Atomic Checkout** (Distributed Lock) and assigns a `run_id`, logging the transition at the `services` layer.
4.  **Execution**: Mastra Agent hydrates context and invokes tools. Every tool call emits a `debug` log with input/output metadata.
5.  **Artifact & Emit**: Agent delivers a `WorkProduct`, releases the lock, and emits an **Internal Event**. Success is broadcasted via the **Notification System**.

## 3. Explicit V2 Technical Decisions

These decisions define the architectural constraints for the Agentic School implementation.

| Topic | V2 Decision | Rationale |
| :--- | :--- | :--- |
| **Tenancy** | Multi-tenant isolation | Enforced at the Repository layer via mandatory `tenant_id` filters. |
| **State** | Local-First (TanStack DB) | High-performance, SPA/PWA offline-capable UI; IndexedDB primary, D1, MySQL, or PostgreSQL secondary. |
| **API** | Hono RPC (`hc`) | End-to-end type safety between Hono controllers and TanStack Query hooks. |
| **Execution** | Stateless Agent Model | Offloading logic to meet Cloudflare's 10ms CPU limit. |
| **Business Model** | Dual-Pillar | Unified infrastructure for B2B Schools and B2C Homeschooling. |
| **Auth** | PBAC | Policy-Based Access Control evaluated at the Edge Gateway. |

## 3. Implementation Mandates

> [!IMPORTANT]
> **Transformation Policy**: We do not "copy-paste" Paperclip. We **Analyze, Review, and Transform** Paperclip logic into EdApex's native Repository/Service/Controller patterns.

## 4. Logical Baseline (Repo Integration)

The EdApex V2 Agentic School is built on the convergence of two major codebases:

### 4.1 EdApex V2 Core (Backend/Infrastructure)
- **Stack**: Hono, Drizzle ORM, Mastra SDK, Cloudflare D1/KV, MySQL, PostgreSQL, SQLite.
- **Repository Pattern**: Multi-dialect support with strict isolation per domain (18 domains natively).
- **PBAC**: Unified policy engine for staff and agents.

### 4.2 Paperclip (Orchestration/UX Patterns)
- **Logic**: Heartbeat loops, atomic checkouts, and fiscal accounting.
- **UX**: Three-pane Command Center, Artifact (WorkProduct) Gallery.
- **Entities**: Mapping Paperclip `Companies` -> EdApex `Tenants/Schools`.

## 5. Hierarchical Multi-Agent System (HMAS)

EdApex V2 implements a recursive, goal-driven hierarchy.

### 5.1 Principal Assistant (The CEO Agent)
- **Role**: Root orchestrator for the school tenant.
- **Responsibilities**: Goal decomposition, high-level reporting, and board communication.
- **Primary Tool**: `delegate_to_supervisor(domain, parameters)`.

### 5.2 Domain Supervisors (Department Heads)
- **Silos**: Academics, Finance, HR, IT, Admissions.
- **Role**: Narrow domain experts responsible for specialized sub-trees.
- **Constraint**: Supervisors can only access repositories relevant to their domain.

### 5.3 Task Agents (Specialized Staff)
- **Roles**: Registrar, Bursar, Inventory Clerk, Teacher Assistant.
- **Capabilities**: Executing specific `SKILL.md` toolsets against the domain repositories.

### 5.4 The Agentic Classroom (Live Delivery Sub-System)
An intense, live-streaming subset of HMAS formally integrated via the stateless graph engine architecture:
- **Director Agent**: Acts as the LangGraph traffic controller, dynamically switching control between Teacher, Evaluator, or User turns.
- **Teacher Agent**: Specialized in pedagogical content delivery, generating interleaved whiteboard (`wb_`) JSON actions and chat text locally.
- **Evaluator Agent**: Passively parses action streams to compress token memory into permanent `WorkProduct` grading records.

### 5.5 Unified Agent Lifecycle (State Machine)
All Agents in EdApex V2 follow a strict state transition model:
- `IDLE`: Registered but awaiting heartbeat/task.
- `AWAKE`: Heartbeat triggered; performing context retrieval.
- `RUNNING`: Executing tools; periodic status reports.
- `PAUSED`: Execution suspended by board or budget limit.
- `ERROR`: Terminal execution failure; requires manual reset.
- `TERMINATED`: Decommissioned.

### 5.6 Human-in-the-Loop "Hand-off" Protocol
- **Constraint**: If a B2C Agent (e.g., Home Mentor) hallucinates or cannot interpret user intent, the user must not be deadlocked.
- **Solution**: The **Escalation Edge Case**. The agent inherently possesses a `request_human_operator` tool. Upon invocation, the `thread_id` is paused and rerouted to the Command Center inbox where a human School Administrator assumes control of the context window.

## 6. API & Communication Architecture

EdApex V2 mandates end-to-end type safety via **Hono RPC**.

### 6.1 Hono RPC + TanStack Query Integration
The frontend MUST avoid ad-hoc `fetch` or `axios` calls. Communication is conducted via the Hono RPC client (`hc`):
1. **Definition**: The Hono backend exports the `AppType`.
2. **Consumption**: The frontend initializes `const client = hc<AppType>('/')`.
3. **Integration**: All API interactions are wrapped in **TanStack Query** (`useQuery`, `useMutation`) using the RPC client for data fetching.

### 6.2 Endpoint Logic (The Bridging Layer)
API endpoints in `controllers/` act as the entry point for the **Anti-Corruption Layer (ACL)**:
- **Tenant Context**: Every endpoint injects the `tenant_id` from the PBAC/Auth session.
- **Repository Injection**: Controllers delegate to the `DomainService`, which uses the `IRepository<T>` for the selected dialect (`D1`, `MySQL`, etc.).

### 6.3 Real-Time Telemetry & The SSE Pattern
- **Constraint**: Cloudflare Workers (Free Tier) enforce strict limitations on persistent WebSocket connections.
- **Solution**: The UI "Agent Pulse Toasts" and Command Center reactivity are powered via **Server-Sent Events (SSE)**. The edge emits unidirectional event streams (`ON_PBAC_VIOLATION`, `AGENT_HEARTBEAT`) to the browser.
- **Agentic Classroom SSE Pipeline**: The live LangGraph execution engine yields a `StatelessEvent` streams (`text` slices and interleaved `action` payload arrays) directly over the Hono `/sse` route, bypassing persistent connection constraints while respecting the 5-Phase atomic lock.
- **Scalability**: The system architecture makes room for a future upgrade to **Cloudflare Durable Objects** for bidirectional WebSocket state when scaling beyond the free tier.

## 7. Canonical Data Model (V2)

All tables MUST include `tenant_id` (uuid), `id` (uuid), `created_at`, and `updated_at`.

### 7.1 Core Orchestration Tables (AI Domain)

These tables are defined within [src/db/sqlite/domain-ai.ts](src/db/sqlite/domain-ai.ts) and represent the evolution of the `aiAgentActions` and `aiToolInvocations` legacy telemetry.

#### `agent_runs` (replaces Paperclip `heartbeat_runs`)
- `id` uuid pk
- `tenant_id` uuid not null
- `agent_id` uuid fk not null
- `status` enum: `queued | running | succeeded | failed | cancelled`
- `invocation_type` enum: `scheduler | manual | event`
- `started_at` timestamptz null
- `finished_at` timestamptz null
- `context_snapshot` jsonb null (Thin vs Fat mode)

### 7.2 Financial Ledger (Finance Domain)

These events are integrated into [src/db/sqlite/domain-finance.ts](src/db/sqlite/domain-finance.ts), extending the `ledgerEntries` model with high-fidelity operational tracking.

#### `cost_events` (Financial Ledger)
- `id` uuid pk
- `tenant_id` uuid not null
- `agent_id` uuid fk not null
- `issue_id` uuid fk null (Attribution to specific task)
- `provider` text not null (OpenAI, Claude, etc.)
- `model` text not null
- `input_tokens` int not null
- `output_tokens` int not null
- `cost_cents` int not null (Calculated at ingestion)

#### `finance_events` (Double-Entry Ledger)
- `id` uuid pk
- `tenant_id` uuid not null
- `type` enum: `debit | credit`
- `category` enum: `ai_cost | tuition | payroll | operational`
- `amount_cents` int not null
- `balance_after_cents` int not null

### 7.3 Work Product & Document System (Documents Domain)

These tables extend [src/db/sqlite/domain-documents.ts](src/db/sqlite/domain-documents.ts), providing structured state for agentic output.

#### `work_products` (replaces Paperclip `assets`)
- `id` uuid pk
- `tenant_id` uuid not null
- `type` enum: `artifact | document | media`
- `storage_provider` enum: `r2 | s3 | local_disk`
- `uri` text not null (Pointer to storage)
- `metadata` jsonb (Version, Format, SHA256)

#### `documents` (Structured Agent Output)
- `id` uuid pk
- `tenant_id` uuid not null
- `latest_content` text not null (Markdown/JSON)
- `revision_count` int not null
- `owner_agent_id` uuid fk null

### 7.4 Classroom Domain (Domain 18 - Live Delivery State)

Defined natively within `src/db/sqlite/domain-classroom.ts`, this domain entirely encapsulates the stateless graph engine orchestration logic. It ensures high-frequency stateless events do not pollute the static Course (LMS) or Academic term tables.

#### `classroom_sessions` (Core)
- `id` uuid pk
- `tenant_id` uuid not null fk
- `course_id` uuid fk (Links to LMS)
- `director_agent_id` uuid fk (Links to AI)
- `status` enum: scheduled | active | completed

#### `classroom_memory_ledger` (LangGraph Buffer)
- `id` uuid pk
- `tenant_id` uuid not null fk
- `session_id` uuid not null fk
- `turn_count` int not null
- `parsed_content` jsonb (Flattened `action` / `text` streaming output arrays)

#### `classroom_participants` (Roster)
- `id` uuid pk
- `tenant_id` uuid not null fk
- `session_id` uuid not null fk
- `user_id` uuid not null fk
- `role` enum: student | human_observer
- `engagement_score` real (dynamically updated by Evaluator Agents)

#### `classroom_whiteboard_state` (WhiteboardLedger Replica)
- `id` uuid pk
- `tenant_id` uuid not null fk
- `session_id` uuid not null fk
- `timeline` jsonb (A replica of the `whiteboardLedger` abstraction utilized by stateless graph engine agents via `wb_` actions)

#### Cross-Domain Relationships (Domain 18 Edges)
- **Academic**: Feeds curriculum context via `course_id` (polymorphic binding to classes/sections).
- **AI**: Ties execution passes directly to `cost_events` for tight token budgeting per heartbeat.
- **Assessment**: Live grading tools; Teacher Agent issues `action` to evaluate in-stream logic.
- **CMS**: Reading material; RAG index vectors generated natively from CMS articles.
- **Core**: Standard Authentication; Tenant validation enforced across all `/sse` endpoints.
- **Documents**: Yields LangGraph end-states directly to `WorkProducts` via `.saveToPolymorphicArtifact` tools.
- **Finance**: Billing for tutors; Hooks evaluate `.budget()` before initiating execution loops.
- **HR**: Supervisor maps; Defines escalation paths to live human staff.
- **LMS**: Pulls `lmsModules` and quizzes as the Director's pedagogical blueprint.
- **PBAC**: Gatekeeper rules; Pre-flight tool policy blocks dangerous `action` events.
- **Settings**: Allows `Standalone Mode` configurations, detaching Classroom routines from Academic scopes (for B2C/retail scaling).

#### Standalone Mode Configuration
To serve the dual-pillar retail model:
If `Settings.isStandalone() == true`, the Hono controllers explicitly ignore dependency lookups against `domain-academic` and `domain-hr`. The `domain-classroom` operates freely exclusively linked to `domain-lms` (the course content provider) and `domain-core` (the tenant user base), utilizing Stripe checkout webhooks for isolated billing separate from the enterprise ledger.

## 8. Frontend Architecture: The Local-First Command Center

EdApex V2 utilizes a **Local-First** paradigm to ensure zero-latency interaction and offline resilience.

### 8.1 The TanStack Stack
- **TanStack Start**: The framework for the Single Page Application (SPA).
- **TanStack DB**: The primary state management layer (IndexedDB).
- **React DB**: Used for optimistic UI and live collection queries.

### 8.2 Synchronization Lifecycle
1. **Local Write**: User/Agent actions are written directly to the local IndexedDB collection.
2. **Optimistic Update**: UI reflects the change immediately.
3. **Background Sync**: A conflict-resolution engine pushes local logs to the Cloudflare D1 backend via Hono RPC.
4. **Reconciliation**: D1 acts as the authoritative source of truth for multi-device consistency.

## 9. Domain-Tool Mapping (The 18 Pillars & 31+ Skills)

Roles are grouped by Domain and implemented as **Standard Educational Skills**. Every domain exposes a set of tools to the HMAS via the **Domain Supervisor**.

| Domain | Key Roles | Supervisor Role | Responsibilities | Primary Agent Tools |
| :--- | :--- | :--- | :--- | :--- |
| **Academic** | Registrar, HOD, Teacher Asst. | Academic Head | Student records, Lesson Plans, Student Analytics. | `enroll_student`, `lesson_plan`, `search_records` |
| **AI** | AI Architect, Token Auditor. | IT Supervisor | Model selection, Cost tracking, Prompt versions. | `check_usage`, `rotate_keys`, `audit_tokens` |
| **Assessment** | Evaluator, Proctor, Author. | Assessment Sup. | Exams, Grading, Question Banks, Results. | `grade_exam`, `generate_quiz`, `monitor_attempt` |
| **Attendance** | Safety Officer, Sentinel. | Safety Officer | Presence verification, Absence flagging, Daily rollups. | `verify_presence`, `flag_absence`, `daily_rollup` |
| **CMS** | Content Head, Webmaster. | IT Supervisor | School website, Blog, Portal content, SEO. | `publish_page`, `update_news`, `seo_audit` |
| **Communication**| PR Officer, Broadcaster. | HR Manager | Parent comms, Broadcasts, Newsletters, Chat. | `send_broadcast`, `moderate_chat`, `draft_news` |
| **Core** | Principal, Admin, Secretary. | Principal Assistant | Strategic goals, Tenant health, Board comms. | `get_school_info`, `set_goal`, `audit_health` |
| **Documents** | Registrar, Archivist. | Registrar | Record archiving, Certificate generation, Signing. | `archive_record`, `generate_cert`, `sign_doc` |
| **Events** | Event Planner, Secretary. | Principal Assistant | School calendar, Meetings, Graduations. | `create_event`, `send_invites`, `check_venue` |
| **Facilities** | Asset Manager, Clerk. | Asset Manager | Inventory tracking, Room booking, Maintenance. | `track_inventory`, `book_room`, `schedule_mtce` |
| **Finance** | Bursar, Accountant, Auditor, Payroll. | Bursar | Fees, Ledgers, Tax compliance, Budget Oversight. | `collect_fees`, `audit_ledger`, `process_payroll` |
| **Homeschool** | Home Mentor, Facilitator. | Home Mentor | Personalized paths, Payouts, Parent portal sync. | `create_path`, `payout_facilitator`, `parent_sync` |
| **HR** | HR Mgr, Payroll Clerk. | HR Manager | Staff mgmt, Policy, Recruitment, Attendance. | `hire_staff`, `terminate_staff`, `view_payroll` |
| **Library** | Librarian, Archivist. | IT Supervisor | Book cataloging, Digital assets, Loans, Archive. | `search_books`, `issue_book`, `check_overdue` |
| **LMS** | Course Designer, Proctor. | Course Designer | Content publishing, Enrollment, Performance. | `create_module`, `generate_quiz`, `monitor_exam` |
| **PBAC** | Compliance Officer, Auditor. | Compliance Officer | Policy evaluation, Role granting, Auditing. | `evaluate_policy`, `grant_role`, `audit_perms` |
| **Settings** | Admin, Config Mgr. | Principal Assistant | School configs, Session dates, Grading scales. | `update_config`, `set_academic_year`, `set_scale` |
| **Classroom**| Director, Teacher, Evaluator. | Director Agent | Stream orchestration, Live pulse boards, Telemetry. | `wb_highlight`, `stream_event`, `eval_turn` |

## 10. Security & PBAC: The Edge-Native Perimeter

EdApex V2 enforces a "Zero-Trust Agent" model. Every tool execution is evaluated against the Policy-Based Access Control (PBAC) engine *before* it leaves the Edge Gateway.

### 10.1 Evaluation Lifecycle
1. **Pre-Tool Request**: Agent (via Mastra) initiates a tool call.
2. **Metadata Injection**: The Hono Request context injects the `actor_id` (Agent UUID) and `tenant_id`.
3. **Policy Check**: The `pbac.evaluate(actor, action, resource)` service queries the Drizzle repository.
4. **Gateway Execution**: If authorized, the tool proceeds; if not, a `403 Forbidden` is returned, and the Agent Run is tagged with a `SECURITY_VIOLATION` status.

### 10.2 Resource Isolation
- **Row-Level Security (RLS)**: Emulated at the Repository layer using `where(eq(schema.tenant_id, context.tenant_id))`.
- **Credential Injection**: `company_secrets` are injected only into the process environment of the individual tool execution, never stored in the main Agent Run context.

### 10.3 External Third-Party Integrations (The Webhooks Gateway)
- **Constraint**: Task Agents (like the Bursar) require access to external APIs (e.g., Stripe, Termii SMS) without exposing raw API keys to the LLM context.
- **Solution**: The **External Vault** and **Egress Policy**. Keys are stored encrypted in `tenant_settings`. Agents call internal facade tools (`trigger_payment`, `dispatch_sms`) rather than performing raw HTTP requests. The Hono controller decrypts the key and executes the external call, ensuring zero LLM API key leakage.

### 10.4 Stream-Time Interception (Agentic Classroom)
For the Live Classroom streaming API (`/sse` endpoint), PBAC validations are executed via a stream interceptor. As partial-JSON `action` elements stream back before the tool invokes, regex and incremental validators intercept and flag potential violations in real-time. If an unauthorized tool payload emerges, the stream forcibly yields a `403` signal to the edge and halts external execution boundaries immediately.

## 11. Professional Code Flow (The 5-Phase Lifecycle)

To ensure consistency across 18+ domains, all Agentic operations must follow the **Standard Orchestration Cycle**.

### 11.1 Phase 1: The Trigger (Signal)
- **Source**: Cron Expression, Webhook (`POST /api/webhooks/raw`), or Manual Board Injection.
- **Action**: A record is created in `agent_wakeup_requests`.

### 11.2 Phase 2: Atomic Checkout (The Handshake)
- **Concurrency Guard**: Domain Supervisor performs an `UPDATE ... WHERE status = 'queued' AND run_id IS NULL`.
- **Result**: Exactly one Supervisor or Agent gains ownership of the task. Failure returns a `409 Conflict` (Paperclip Pattern).

### 11.3 Phase 3: Execution (The Run)
- **Context Retrieval**: Agent pulls `Fat Context` (Budget, Goals, Recent Comments).
- **Tool Invocations**: Agent interacts with Domain Repositories (e.g., `Registrar.getStudent()`).
- **Reporting**: Periodic `Heartbeat` status updates to `agent_runs`.

### 11.4 Phase 4: Governance (The Board Approval)
- **Impact Analysis**: If cost > $1.00 or deletion of core data is requested, the run enters `PAUSED_FOR_APPROVAL`.
- **Human-in-the-loop**: Board operator reviews the `WorkProduct` draft and clicks `Approve`.

### 11.5 Phase 5: Artifact & Completion (The Result)
- **Persistence**: Work is finalized in the `work_products` registry.
- **Log-off**: Agent run is marked `succeeded`, and the next dependent trigger is fired.

### 11.6 Agentic Classroom Execution: The Director Graph Loop
A deeper execution pattern occurs natively in **Domain 18 (Classroom)** for live, stateful multi-agent interactions:
- **Phase 1 & 2**: CRON emits `ON_SESSION_START` into the classroom bus or a student sends a chat. Request passes `TenantGuard` and `validators/`.
- **Phase 3**: DomainService performs atomic checkout to lock the active session, blocking race events.
- **Phase 4 (LangGraph Loop)**: EdApex spins up the `createOrchestrationGraph()`. The `DirectorAgent` evaluates state and assigns a turn. The selected agent (e.g., `TeacherAgent`) produces incrementally chunked JSON over SSE. Edge buffers the state into `classroom_memory_ledger` to safely yield under the 10ms CPU limit.
- **Phase 5**: LangGraph concludes single-pass loop. Evaluators may passively generate `WorkProducts` for grading records. `CLASSROOM_TURN_COMPLETE` bus event fires.

## 12. Financial Accounting: Double-Entry Ledger System

Total fiscal accountability is non-negotiable for AI-native schools.

### 12.1 Token Cost Calculation
- Input/Output tokens are recorded per tool call.
- The `AI Service` calculates the cent-cost using the current `provider_pricing` lookup.
- Entries are written to `cost_events` (The "AI Expense Line").

### 12.2 The General Ledger (Finance Domain)
Every `cost_event` triggers a corresponding `finance_event`:
- **Debit**: Tenant AI Operational Budget.
- **Credit**: EdApex Platform Infrastructure Account.
- **Auditability**: These rows are append-only. Any adjustment requires a "Counter-Entry" record.

## 13. Specialized AI Role Library (The 31+ Skills)

Each role is a specialized Mastra Agent with its own `SKILL.md` manifest and a restricted toolset.

### 13.1 Academic Domain (The Registrar's Office)

#### 13.1.1 Registrar Agent
- **Purpose**: Authority over student enrollment and record integrity.
- **Mastra Tools**:
    - `registrar.searchStudents(query, filter)`: High-performance RDS search with `tenant_id` filter.
    - `registrar.enrollStudent(studentData)`: Validates NERDC compliance before Drizzle insert.
    - `registrar.verifyTranscript(studentId)`: Cross-references Assessment domain records.
    - `registrar.archiveRecord(recordId)`: Moves completed student files to long-term R2 storage.
- **Reporting Line**: Reports to Academic Supervisor.

#### 13.1.2 HOD (Head of Department)
- **Purpose**: Academic quality assurance and curriculum oversight.
- **Mastra Tools**:
    - `academic.getCurriculum(subjectId)`: Retrieves the current NERDC-aligned curriculum.
    - `academic.assignTeacher(classId, teacherId)`: Maps staff to courses in the LMS domain.
    - `academic.auditLessonPlan(planId)`: Compares plan vs curriculum for alignment.
    - `academic.validateResource(resourceId)`: Ensures textbook/media alignment with school policy.
- **Reporting Line**: Reports to Academic Supervisor.

#### 13.1.3 Assessment Evaluator
- **Purpose**: Autonomous grading and performance feedback loops.
- **Mastra Tools**:
    - `assessment.gradeSubmission(submissionId)`: Uses Gemini-1.5-Pro for rubric-based grading.
    - `assessment.generateTranscript(studentId)`: Produces a certified PDF WorkProduct.
    - `assessment.flagPerformanceAnomaly(minThreshold)`: Scans for grades outside 2 standard deviations.
    - `assessment.recommendIntervention(studentId)`: Suggests student for "Personalized Path" (Homeschooling domain).

### 13.2 Finance Domain (The Bursar's Office)

#### 13.2.1 Bursar Agent
- **Purpose**: Managing the school's inflow and fee collection cycle.
- **Mastra Tools**:
    - `bursar.calculateFees(studentId)`: Computes base tuition + arrears + late fees.
    - `bursar.issueInvoice(studentId, amount)`: Creates a payment-link WorkProduct.
    - `bursar.reconcilePayment(refId)`: Bridges third-party gateway signal to the Ledger.
    - `bursar.generateAgingReport()`: Lists students with outstanding fees over 30 days.
- **Reporting Line**: Reports to Finance Supervisor.

#### 13.2.2 Accountant Agent
- **Purpose**: Managing the school's outflow and operational budget.
- **Mastra Tools**:
    - `finance.processPayroll(cycleId)`: Calculates deductions and net pay via HR domain.
    - `finance.auditLedgerEntries(startDate, endDate)`: Scans for un-reconciled debit/credit pairs.
    - `finance.generateFiscalReport()`: Produces a P&L WorkProduct for the Board.
    - `finance.approveExpense(requestId)`: Validates expense against domain budget policy.

#### 13.2.3 AI Auditor (Cost Control)
- **Purpose**: Ensuring AI-token spend is within budget policies.
- **Mastra Tools**:
    - `ai.getAgentSpend(agentId)`: Aggregates `cost_events` for the current month.
    - `ai.enforceAgentPause(agentId)`: Triggers status change if 100% budget reached.
    - `ai.predictMonthlySpend()`: Extrapolates current run frequency to end-of-month.
    - `ai.identifyWastefulRuns(threshold)`: Flags agents with high cost but low WorkProduct output.

### 13.3 HR & Admin Domain (The Front Office)

#### 13.3.1 HR Manager Agent
- **Purpose**: Staff lifecycle management and payroll orchestration.
- **Mastra Tools**:
    - `hr.getStaffDetails(staffId)`: Fetches contract, role, and salary data.
    - `hr.updateAttendance(staffId, date, status)`: Records daily presence for payroll calculation.
    - `hr.initiateOnboarding(staffData)`: Creates skeleton record and assigns initial PBAC roles.
    - `hr.generateLeaveReport()`: Summarizes staff availability for Supervisor planning.
- **Reporting Line**: Reports to HR/Admin Supervisor.

#### 13.3.2 Compliance Officer (Regulatory Bot)
- **Purpose**: Enforcing state and NERDC educational standards.
- **Mastra Tools**:
    - `compliance.auditAttendanceRecords(date)`: Scans for missing entries required by state law.
    - `compliance.generateNERDCReport()`: Aggregates school-wide metrics into prescribed format.
    - `compliance.checkSafetyPolicy(policyId)`: Verifies facility maintenance logs via IT domain.
- **Reporting Line**: Reports to HR/Admin Supervisor.

#### 13.3.3 PR Officer (Communication Agent)
- **Purpose**: Managing school-to-parent and school-to-community relations.
- **Mastra Tools**:
- **Purpose**: Managing student lifecycle and records.
- **Mastra Tools**: `academic.enrollStudent`, `academic.searchRecords`, `academic.updateProfile`.
- **Reporting Line**: Academic Head.

#### 13.1.2 HOD Agent (Pedagogical Lead)
- **Purpose**: Oversight of departmental lesson plans and subject alignment.
- **Mastra Tools**: `academic.createLessonPlan`, `academic.auditSyllabus`, `academic.assignTeacher`.
- **Reporting Line**: Academic Head.

### 13.2 AI Domain (Orchestration & Costs)

#### 13.2.1 AI Ops (The Orchestrator Assistant)
- **Purpose**: Technical maintenance of the HMAS loop and token budgets.
- **Mastra Tools**: `it.checkAgentHealth`, `it.rotateAPIKeys`, `it.auditTokenCents`.
- **Reporting Line**: IT Supervisor.

### 13.3 Assessment Domain (The Examination Hall)

#### 13.3.1 Assessment Evaluator
- **Purpose**: Autonomous grading and performance feedback loops.
- **Mastra Tools**: `assessment.gradeExam`, `assessment.computeSchoolAverages`.
- **Reporting Line**: Assessment Supervisor.

### 13.4 Attendance Domain (Presence & Safety)

#### 13.4.1 Safety Officer
- **Purpose**: Monitoring campus entry logs and security events.
- **Mastra Tools**: `attendance.verifyPresence`, `attendance.flagSecurityAnomaly`.
- **Reporting Line**: HR Manager.

### 13.5 CMS Domain (Digital Presence)

#### 13.5.1 Content Head
- **Purpose**: Strategic oversight of the school's public website and portal.
- **Mastra Tools**: `cms.publishPage`, `cms.updateNews`, `cms.seoAudit`.
- **Reporting Line**: IT Supervisor.

### 13.6 Communication Domain (PR & Engagement)

#### 13.6.1 PR Officer
- **Purpose**: Managing parent communications and public relations.
- **Mastra Tools**: `comm.sendBroadcast`, `comm.moderateChat`, `comm.draftNewsletter`.
- **Reporting Line**: HR Manager.

### 13.7 Core Domain (Executive Strategy)

#### 13.7.1 Principal Assistant
- **Purpose**: Top-level orchestration and goal decomposition.
- **Mastra Tools**: `orchestrate.setGoal`, `orchestrate.reportStatus`, `orchestrate.auditTenant`.
- **Reporting Line**: Administrator/Board.

### 13.8 Documents Domain (The Archive)

#### 13.8.1 Archivist Agent
- **Purpose**: Document lifecycle and digital signing.
- **Mastra Tools**: `docs.archiveRecord`, `docs.generateCertificate`, `docs.signDocument`.
- **Reporting Line**: Registrar.

### 13.9 Events Domain (School Life)

#### 13.9.1 Event Planner
- **Purpose**: Managing the school calendar and event logistics.
- **Mastra Tools**: `events.createEvent`, `events.sendInvites`, `events.checkVenue`.
- **Reporting Line**: Principal Assistant.

### 13.10 Facilities Domain (Infrastructure)

#### 13.10.1 Asset Manager
- **Purpose**: Inventory and maintenance of physical school assets.
- **Mastra Tools**: `facilities.trackInventory`, `facilities.bookRoom`, `facilities.scheduleMaintenance`.
- **Reporting Line**: Asset Manager.

### 13.11 Finance Domain (The Ledger)

#### 13.11.1 Bursar Agent
- **Purpose**: Revenue collection and fee management.
- **Mastra Tools**: `finance.collectFees`, `finance.issueInvoice`.
- **Reporting Line**: Bursar.

#### 13.11.2 Accountant Agent
- **Purpose**: Expenditure tracking and double-entry auditing.
- **Mastra Tools**: `finance.auditLedger`, `finance.processPayroll`.
- **Reporting Line**: Bursar.

### 13.12 Homeschooling Domain (B2C Extension)

#### 13.12.1 Home Mentor
- **Purpose**: Personalized academic coaching for distance learners.
- **Mastra Tools**: `homeschool.createPath`, `homeschool.recommendSupplements`.
- **Reporting Line**: Principal Assistant.

### 13.13 HR Domain (Staff Management)

#### 13.13.1 HR Manager
- **Purpose**: Staff management, recruitment, and policy compliance.
- **Mastra Tools**: `hr.hireStaff`, `hr.terminateStaff`.
- **Reporting Line**: HR Manager.

### 13.14 Library Domain (The Knowledge Base)

#### 13.14.1 Librarian Agent
- **Purpose**: Management of books and digital learning assets.
- **Mastra Tools**: `library.searchBooks`, `library.issueBook`, `library.checkOverdue`.
- **Reporting Line**: IT Supervisor.

### 13.15 LMS Domain (The Digital Classroom)

#### 13.15.1 Course Designer
- **Purpose**: Content creation and curriculum publishing.
- **Mastra Tools**: `lms.createModule`, `lms.generateQuiz`.
- **Reporting Line**: Academic Head.

### 13.16 PBAC Domain (Governance)

#### 13.16.1 Compliance Officer
- **Purpose**: Security auditing and role-based access enforcement.
- **Mastra Tools**: `pbac.evaluatePolicy`, `pbac.grantRole`, `pbac.auditPerms`.
- **Reporting Line**: Principal Assistant.

### 13.17 Settings Domain (Global Config)

#### 13.17.1 Config Manager
- **Purpose**: Managing school-wide configurations and term dates.
- **Mastra Tools**: `settings.updateConfig`, `settings.setAcademicYear`.
- **Reporting Line**: Principal Assistant.

### 13.18 Classroom Domain (Live Environment)

#### 13.18.1 Director Agent
- **Purpose**: Turn orchestration and LangGraph traffic control (`directorNode`).
- **Reporting Line**: Principal Assistant.

#### 13.18.2 Teacher Agent
- **Purpose**: Streamed pedagogical instruction leveraging interleaved board/chat arrays.
- **Mastra Tools**: `wb_show_image`, `wb_highlight`, `wb_pan`.
- **Reporting Line**: Director Agent.

#### 13.18.3 Evaluator Agent
- **Purpose**: Passive grading and RAG token compaction across live session durations.
- **Reporting Line**: Director Agent.

## 14. Technical Enhancements: The Edge-Native Evolution
- **Constraint**: Cloudflare's 10ms CPU limit prevents long-running synchronous agent loops.
- **Solution**: The `Heartbeat` protocol is implemented via **D1-backed State Resumption**.
    - Each "Step" of the LLM execution is a discrete Hono request.
    - Context is hydrated/dehydrated from the `agent_runs` table between steps.
- **The Execution Loop**:
    1. `Wakeup`: Signal received (timer, event, manual).
    2. `Checkout`: Supervisor locks the `agent_run`.
    3. `Hydrate`: Pull `agent_runtime_state` (counters, session ID) and `agent_task_sessions` (resumable per task).
    4. `Invoke`: Call the Mastra Agent with the `TaskSession`.
    5. `Snapshot`: Save the LLM's internal state and tool results back to D1.
    6. `Yield/Finish`: Close the request to stay under CPU limits.

### 14.2 Session Compaction (The Memory Service)
- **Problem**: Context window inflation leads to $10+ per-run costs.
- **Solution**: The `MemoryService` performs **Recursive Summarization**.
    - Every 5 tool calls, the agent's recent history is summarized into a "Compressed Memo."
    - The full history is moved to `WorkProducts` for archival, while the agent keeps ONLY the memo and the last 3 turns.

### 14.4 AI Domain & Adapter Registry
- **Unified Adapter**: Standardizes [Claude](paperclip/ui/src/api/agents.ts#193-195), `GPT`, and `Gemini` into a single Mastra-backed `StandardAdapter` interface.
- **Provider Switching**: Dynamic model selection based on `intent` (reasoning vs. speed) and `budget` availability.
- **Global Skill Injection**: Agents pull skills from the `edapex-domain-architect` registry, ensuring cross-domain tool consistency.

### 14.5 Automation: Routines & Triggers
- **Routines**: Recurring behaviors (e.g., "Daily Fee Audit", "Weekly Curriculum Sync") managed by the `RoutineEngine`.
- **Triggers**: Comprehensive support for **Cron Expressions**, Webhooks (`POST /api/webhooks/raw`), and System Events (Drizzle hooks).
- **Atomic Checkout**: Every routine execution required a successful distributed lock in `agent_wakeup_requests`.

### 14.6 Governance: Maximizer & WorkProducts
- **Maximizer Mode**: Proactive auditor agents scanning for inefficiencies in school metadata and creating Board Proposals.
- **Work Product Registry**: Tracks artifacts ([Result](file:///home/beznet/Workspace/edapex/paperclip/ui/src/api/agents.ts#36-44)) separate from conversation history, allowing for clean structured data extraction and auditing.

### 14.7 Document & Artifact Generation (The Binary Bridge)
- **Constraint**: Edge networks (Cloudflare Workers) do not natively support headless browser environments or `child_process` execution for PDF rendering.
- **Solution**: The Agentic School adapts the V1 MVP `html2pdf` binary execution pattern for heavy document artifacts (e.g., transcripts, invoices) while ensuring edge-compatibility.
- **The Execution Flow**:
    1. **Agent Output**: Instead of attempting to stream complex PDFs directly, Mastra Task Agents generate rich, standardized `HTMLContent` strings (using Tailwind tokens).
    2. **Binary Delegation**: The `DocumentsService` delegates the HTML payload to a localized `generate({ htmlContent, fileName, preview })` utility.
    3. **Container Bridge**: To bypass Edge constraints, this specific operation is either deferred to a Dockerized companion service (or Cloudflare Container) that mounts `/bin/html2pdf` and securely executes the transformation in a UUID-isolated `/temp` directory using `JSZip` and `fs`.
    4. **Artifact Storage**: The resulting `.pdf` buffer (or `.zip` for image previews) is flushed to Cloudflare R2, and a permanent `WorkProduct` record is appended to the `documents` domain registry.

### 14.8 Data Privacy & PII Obfuscation (GDPR/NDPR)
- **Constraint**: Providing raw student data (names, medical conditions) to external LLM providers (OpenAI/Anthropic) violates privacy compliance.
- **Solution**: An automated **PII Obfuscation Middleware** sits within the `StandardAdapterRegistry`. Before goals are dispatched, identifying fields are tokenized (e.g., replacing "John Doe" with `[STUDENT_A]`). The output is de-tokenized when returned to the Edge, ensuring zero PII leak to AI providers.

## 15. Low-Level API Reference (Hono RPC)

End-to-end type safety is achieved by exporting the `AppType` from the Hono server.

### 15.1 Core Orchestration Routes

```typescript
/**
 * GET /api/orchestrate/pending
 * Returns the current checkout queue for the Domain Supervisor.
 */
type PendingRequest = {
  id: string;
  tenant_id: string;
  domain: "ACADEMIC" | "FINANCE" | "HR" | "IT";
  priority: number;
  trigger_metadata: {
    source: "cron" | "webhook" | "manual";
    timestamp: string;
    payload_hash: string;
  };
};

/**
 * POST /api/orchestrate/checkout
 * Atomic lock on a task for a specific agent.
 */
type CheckoutRequest = {
  requestId: string;
  agentId: string;
};

type CheckoutResponse = {
  runId: string;
  fatContext: {
    budgetRemainingCents: number;
    goalDescription: string;
    recentArtifacts: Array<{ 
      id: string;
      title: string;
      uri: string;
      productType: "DOCUMENT" | "LEDGER_ENTRY";
    }>;
    systemConstraints: string[]; // e.g. ["NO_EXTERNAL_CALLS", "READ_ONLY_LMS"]
  };
};

/**
 * POST /api/orchestrate/heartbeat
 * Updates the status and allows for state resumption.
 */
type HeartbeatUpdate = {
  runId: string;
  status: "RUNNING" | "PAUSED" | "SUCCESS" | "FAILED";
  logEntry?: string;
  toolCall?: { 
    toolName: string;
    arguments: Record<string, any>;
    startTime: string;
  };
};
```

### 15.2 Financial & Ledger Routes

```typescript
/**
 * POST /api/finance/ledger/event
 * Append-only double-entry ledger record.
 */
type LedgerEvent = {
  type: "DEBIT" | "CREDIT";
  category: "AI_COST" | "TUITION" | "PAYROLL" | "OPERATIONAL";
  amountCents: number;
  description: string;
  referenceId: string; // runId, invoiceId, or payrollId
  metadata: {
    provider?: string;
    model?: string;
    tokenCount?: number;
  };
};

/**
 * GET /api/finance/budget/status
 */
type BudgetStatus = {
  allocatedCents: number;
  spentCents: number;
  remainingCents: number;
  burnRatePerDay: number;
  estimatedExhaustionDate: string;
};
```

## 16. The Metadata Layer: Portable Schools

EdApex V2 schools are defined by mandatory markdown manifests in the tenant root.

### 16.1 `SCHOOL.md` (The Board Charter)
Defines the high-level identity and constraints of the institution.
- **Name**: Official School Name.
- **Mission**: Strategic focus (e.g., "STEM Excellence").
- **Budget Policy**: 
    - `max_monthly_ai_spend`: in USD.
    - `approval_threshold`: cost above which a human must approve a run.
- **Supervisors**: Map of Domain -> Agent Role.

### 16.2 `AGENTS.md` (The Virtual Staff)
Defines every AI agent available in the tenant.
- **Role**: Registrar, Bursar, etc.
- **Adapter**: `openai-o3-mini`, `anthropic-claude-3-7-sonnet`, `gemini-2.0-flash`.
- **Permission Scope**: List of Hono route groups (e.g., `["academic.*", "finance.read"]`).
- **Reporting Lines**: Parent agent ID (Principal Assistant or Domain Supervisor).

### 16.3 Multi-Currency, i18n, & Regional Localization
To support borderless B2B constraints, metadata manifests explicitly define:
- **BaseCurrency**: The unified currency code (e.g., `USD`, `NGN`) for rendering `amount_cents` ledgers.
- **Locale**: The region standard (e.g., `en-GB`, `fr-CA`) governing date formats. This is injected into the Mastra context, ensuring generated PDF Artifacts match regional standards dynamically.

## 17. Finalized Phased Roadmap

### Phase 1: Foundation & Ledger (Weeks 1-4)
- **Cleanup**: Purge legacy Paperclip `models/` and replace with Drizzle Repo.
- **Schema**: Deploy multi-tenant `cost_events` and `finance_events` across all dialects.
- **Logic**: Port Paperclip `heartbeat.ts` "Atomic Checkout" to Hono `DomainService`.
- **Registry**: Build the unified Mastra-backed `StandardAdapter` for model switching.

### Phase 2: Gateway & Sync (Weeks 5-8)
- **PBAC**: Implement the Edge Gateway policy evaluator with Redis/KV caching.
- **RPC**: Export backend `AppType` and generate the frontend `hc` client.
- **Local-First**: Setup TanStack DB collections and background reconciliation engine.
- **UI Shell**: Implement the Three-Pane Command Center shell in TanStack Start.

### Phase 3: Role Library & HMAS (Weeks 9-12)
- **Agents**: Deploy the 31+ Specialized Roles via Mastra Skills.
- **Prompting**: Refactor all Paperclip prompts into the EdApex versioned Prompt Registry.
- **Hierarchy**: Implement the recursive `delegate_to_supervisor` tool and goal decomposition.
- **Artifacts**: Implement the WorkProduct registry and gallery viewer.

### Phase 4: Optimization & Delivery (Weeks 13-16)
- **Summarization**: Deploy the `MemoryService` recursive summarization bot.
- **Maximizer**: Activate autonomous proactive auditor agents scanning for inefficiencies.
- **Sync Optimization**: Finalize conflict-resolution engine and Hono RPC call batching.
- **Handover**: Export the complete `SCHOOL.md` manifest for the target tenant.

## 18. Verification Plan

| Milestone | Verification Activity | Target Outcome |
| :--- | :--- | :--- |
| **End-to-End Type Safety** | Run `pnpm tsc --noEmit` on both UI and Backend. | Zero TypeScript errors across the Hono RPC boundary. |
| **Atomic Concurrency** | Parallel checkout stress test (100 threads). | Exactly one successful checkout; 99 `409 Conflict` errors. |
| **PBAC Enforcement** | Unauthorized tool call attempt from Task Agent. | Gateway returns `403 Forbidden`; Logged as security alert. |
| **Local-First Resilience**| Toggle Offline Mode, edit ledger, reload, reconnect. | Data persists in IndexedDB and syncs to D1 upon reconnect. |
| **Financial Auditability** | Cross-reference `cost_events` with OpenAI Dashboard. | Total cent-spend matches provider invoices to <0.1% margin. |
| **Goal Decomposition** | Board Goal: "Reduce operational overhead by 5%." | Principal decomposes into Finance and IT supervisor tasks. |

## 19. UX & Interface Specification: The Command Center

EdApex V2 mandates a premium, high-density interface across all platforms, designed as a professional-grade control plane.

### 19.1 Design Tokens (Tailwind CSS v4)
- **Palette**: 
    - `Background`: Deep Obsidian (#0B0B0C)
    - `Primary`: Kinetic Blue (HSL 215, 80%, 50%)
    - `Secondary`: Muted Platinum (HSL 215, 10%, 60%)
    - `Success`: Emerald Glow (HSL 150, 80%, 40%)
    - `Warning`: Amber Alert (HSL 35, 90%, 50%)
- **Glassmorphism**: Backdrop blur (12px) with 5% white overlay for all floating Agent panels.
- **Typography**: `Outfit` for headers (700 wt) and `Inter` for body (400 wt).
- **Density**: "High-Density" default; 4px grid spacing, 12px base font size for data tables.

### 19.2 The "Command & Control" Layout (Pane Specs)
- **Global SearchBar**: Persists at the top; mapped to the `PrincipalAssistant` for natural language intent resolution.
    - **Search**: Natural language queries (e.g., "How many students are failing math?").
    - **Context**: Automatically scopes to the active tenant and user.
    - **Action**: Triggers the `PrincipalAssistant` to decompose the request into domain-specific tasks.
- **Agent Pulse**: A real-time timeline in the right panel showing the `Heartbeat` stream and `Atomic Checkout` events.
    - **Heartbeat**: Periodic status updates from all active agents.
    - **Atomic Checkout**: Real-time display of token usage and cost events.
- **WorkProduct Thumbnails**: Interactive cards for artifacts with "Preview" and "Audit" actions.
    - **Preview**: Read-only view of the artifact.
    - **Audit**: AI-assisted verification of the artifact.
- **Micro-Animations**: Hover-triggered glass refraction (Refraction-Pro) and smooth status transition fades (150ms).
- **Sidebar (240px)**: 
    - Collapsible navigation with active state indicators (Kinetic Blue glow).
    - Scopes: Institutional (School-wide), Departmental (Domain), and Personal (Individual Student/Staff).
- **Main Content (Flex)**:
    - **Header**: Breadcrumbs with "Favorite/Star" toggle and Context Menu.
    - **Tabbed Views**: Overview, Activity, Heartbeats, Financials, Settings.
    - **WorkProduct Gallery**: Masonry grid of interactive cards with 2D/3D hover transforms.
- **Properties Panel (320px)**:
    - Real-time "Agent Pulse" showing current tool-call and token usage.
    - Historical budget performance sparklines (last 30 days).
    - Quick Actions: Pause, Trigger Heartbeat, View Run Logs.

### 19.4 Specialized UI Components
- **Agent Pulse**: A real-time timeline in the right panel showing the `Heartbeat` stream and `Atomic Checkout` events. This provides instant visibility into agent autonomy.
- **WorkProduct Thumbnails**: Interactive cards for artifacts with distinct "Preview" (read-only) and "Audit" (AI-assisted verification) actions.
- **Micro-Animations**: 
    - Hover-triggered glass refraction effect using the **Refraction-Pro** library.
    - Smooth status transition fades (150ms) for all agent state changes (`IDLE` -> `AWAKE` -> `RUNNING`).
    - Kinetic scrolling for long heartbeat logs.

### 19.5 Agentic Classroom Interfaces (Web UI)
The Edge-native classroom leverages `ai-elements` to render incoming `StatelessEvent` streams seamlessly:
- **The Student Immersive Interface**: Subscribes to the `/sse` stream. Parses `action` arrays (tool executions, pop quizzes) as inline widgets or "Thinking" states, while `text` items type natively into the chat.
- **The "Pulse" Whiteboard Pipeline**: Renders synchronized SVG whiteboards dynamically controlled by the Teacher Agent (`wb_highlight`, `wb_show_image`), drawing exactly in sync with the typing speed of the speech chunks.
- **Teacher & Admin Escalate View**: Provides administrators a 3-pane live supervision perspective (Graph Pipeline Logs / Shadow Whiteboard / Intervention Chat). Human instructors can push a `type: "escalation"` event to forcibly halt the checkout loop and override the AI in real-time.

## 20. Event Bus & Routine Specification

The Agentic School operates on a "Reactive Backbone" instead of polling.

### 20.1 Routine JSON Schema
All recurring tasks follow this standard schema:
```json
{
  "routineId": "uuid",
  "name": "Daily Attendance Reconciliation",
  "schedule": "0 8 * * *",
  "domain": "ATTENDANCE",
  "principal_approval_required": true,
  "steps": [
    {
      "order": 1,
      "agentRole": "Safety Officer",
      "tool": "attendance.verify_presence",
      "args": { "mode": "STRICT" }
    },
    {
      "order": 2,
      "agentRole": "PR Officer",
      "tool": "comm.send_broadcast",
      "args": { "template": "absence_alert" }
    }
  ]
}
```

### 20.2 Logic Hooks (Event Triggers)
- `ON_EXAM_COMPLETED`: Triggers the Assessment Evaluator to begin rubric-based grading and update `computedResults`.
- `ON_STUDENT_ENROLLED`: Triggers the Accountant to issue a tuition invoice and moves the student into the `Admissions` domain workflow.
- `ON_MARK_PUBLISHED`: Triggers the PR Officer to send a notification to the Parent Portal.
- `ON_BOOK_OVERDUE`: Triggers the Librarian to flag the `loan_state` and the PR Officer to send a notification.
- `ON_PAGE_DRAFTED`: Triggers the Content Head to perform an SEO audit and request Principal approval for publishing.
- `ON_CALENDAR_CONFLICT`: Triggers the Event Planner to suggest an alternative venue or timestamp.
- `ON_COST_THRESHOLD_EXCEEDED`: Triggers the AI Auditor to pause non-essential runs and notify the Finance Supervisor.
- `ON_PBAC_VIOLATION`: Triggers immediate Board notification, Agent lockdown, and creates a `SECURITY_INCIDENT` WorkProduct.
- `ON_LMS_SCORE_LOW`: Triggers a Curriculum Head to review the recent Assessment evaluator logs and suggest a "Personalized Path".
- `ON_FACILITY_DAMAGED`: Triggers the Asset Manager to create a maintenance ticket and notify the Facilities Supervisor.
- `ON_SYSTEM_CONFIG_CHANGED`: Triggers a full tenant health audit by the AI Ops agent to ensure no breaking changes in term dates.

### 20.3 Wakeup Coalescing Logic
To prevent redundant execution, the `Wakeup Coordinator` coalesces parallel signals:
- **Rule**: If a `RUNNING` heartbeat exists for the same `agent_id` + `task_id`, the new signal is merged as a `pendingWakeup` flag.
- **Wait**: Signals are debounced for 500ms at the edge before triggering the orchestrator.

## 21. Anti-Corruption Layer (ACL) Transformation Mapping

Mapping the proven Paperclip logic to the strict EdApex Domain-Repository architecture.

| Paperclip Service (Legacy) | EdApex Domain | EdApex BaseController Method | EdApex Repository Call |
| :--- | :--- | :--- | :--- |
| `costs.ts/aggregate()` | AI Ops | `GET /api/ai/costs` | `agent_runs.getSum(tenant_id)` |
| `issues.ts/adopt()` | HMAS Core | `POST /api/orchestrate/checkout` | `agent_wakeup.update(status='running')` |
| `heartbeat.ts/run()` | HMAS Core | `POST /api/orchestrate/heartbeat`| `agent_runs.upsert(status, log)` |
| `assets.ts/save()` | Documents | `POST /api/docs/artifact` | `work_products.insert(uri, meta)` |
| `billing.ts/invoice()`| Finance | `POST /api/finance/invoice` | `ledger.insert(debit, credit)` |
| `staff.ts/get()` | HR | `GET /api/hr/staff` | `employees.select().where(id)` |

## 22. Detailed Logic: The "Maximizer" Proactive Auditor

The "Maximizer" is a background supervisor that scans the school's metadata for optimizations.

### 22.1 Objective Function
The Maximizer attempts to maximize "Academic Growth" while minimizing "Operational Cost" (in cents).
- **Core Formula**: `Efficiency = (Sum(Artifact Quality) / Sum(Token Spend)) * UtilizationRate`.

### 22.2 Operation Sequence
1. **Scoping**: Scans the `library` for all recent `WorkProducts` (artifacts) across Academic, LMS, and Assessment domains.
2. **Analysis**: Uses Gemini-1.5-Pro to analyze the "Quality Density" of artifacts against NERDC standards.
3. **Drafting**: Creates a `STRATEGIC_PROPOSAL` WorkProduct in the Board Command Center.
4. **Approval**: Once the human administrator reviews and approves, the Maximizer triggers the relevant Task Agents to execute systematic changes.

### 22.3 Optimization Algorithms
The Maximizer utilizes a multi-objective optimization suite:
- **Token Conserver**: Minimizes token-per-turn by increasing session compaction frequency.
- **Success Maximizer**: Prioritizes higher-cost models (GPT-4o/Claude-3.5) for critical governance tasks.
- **Budget Aligner**: Dynamically scales agent "thinking time" (context window) based on remaining monthly cents.
- **Outcome Scoring**: A Bayesian filter that ranks agent effectiveness based on board approval rates.

## 23. System Self-Correction & Error Handling

To ensure high-availability at the edge, EdApex V2 handles common failure modes natively.

- **Downtime Mode**: If Cloudflare D1 is unavailable, the `SyncEngine` caches all Drizzle commands in IndexedDB `mutation_logs`.
- **Hallucination Guard**: Agents must cross-reference at least two tools or repository views before performing a `DELETION` or `FINANCIAL_EVENT`.
- **Retry Policy**: Exponential backoff (max 5 retries) for all `toolCall` failures, backed by KV-stored error state.
- **Manual Override**: The Board can kill any `runId` via the Hono API Gateway, regardless of agent status.

### 23.1 Disaster Recovery & Local-First Resync
- **The Wipe Scenario**: If a physical device clears its IndexedDB before a sync, or a D1 point-in-time corruption occurs.
- **Recovery Protocol**: The tenant implements a **Snapshot Hydration Flow** fetching the last validated D1 Point-in-Time Recovery (PITR) state. The browser automatically clones the canonical cloud state down to IndexedDB upon the next authenticated login before resuming operations.

## 24. Performance & Scalability (V2 Metrics)

- **Max Latency (Client)**: 50ms (Optimistic Update via TanStack DB).
- **Max Latency (Sync)**: 200ms (Hono RPC to D1).
- **Max Concurrency**: 5,000 active agents per tenant cluster.
- **Storage Strategy**: D1 for relational state; R2 for artifact blobs; KV for fast-path policy evaluation.
- **Availability Target**: 99.9% uptime for the Edge HMAS bridge.
- **Edge Worker Lifecycles**: Strict 10ms execution times are honored. The Live `DirectorGraph` explicitly yields execution loops between node ticks to stream chunks cleanly.
- **Inertial Conflict Resolution**: In multi-observer instances (student/admin views), TanStack DB caches offline chat inputs locally, merging intelligently when SSE confirms synchronization against the canonical state.

## 26. Token Optimization & Delta Telemetry

To minimize operational costs, EdApex V2 implements the "Delta Preamble" strategy for all heartbeats.

### 26.1 Delta Telemetry (The Baseline)
- **Measurement**: Every `agent_run` records both `rawTokens` (reported by provider) and `normalizedDeltaTokens` (delta against the last run in the same session).
- **Accounting**: For sessioned adapters (Codex/Claude), Paperclip-style accounting ensures we don't "double-count" long-lived context tokens in the ledger.

### 26.2 Bootstrap vs. Heartbeat Prompts
- **Bootstrap Prompt**: Sent ONLY during session initialization. Contains deep identity, permanent skills, and global school mission.
- **Heartbeat Prompt**: Sent on every turn. Contains ONLY the latest signal, new tool results, and the most recent 3 turns.
- **Result**: High prompt cache-hit ratio at the provider level, saving 30-60% in input costs.

### 26.3 Incremental Context Fetching
Agents are instructed to use "Lite" endpoints by default:
- `GET /api/docs/inbox-lite`: Returns only IDs and `updated_at` timestamps for pending tasks.
- `GET /api/docs/comments?since=...`: Fetches only new thread messages since the last heartbeat.

## 27. Budget Policies & Preflight Enforcement

The "Bursar" domain manages systemic guardrails to prevent runaway costs.

### 27.1 Policy Model
- **Money First**: Hard-stops are based on **Billed Cents**, not raw tokens.
- **Thresholds**:
    - **Soft Alert (80%)**: Triggers `ON_COST_THRESHOLD_EXCEEDED` event (Activity Log only).
    - **Hard Stop (100%)**: Agent is immediately set to `PAUSED` status; creates an `APPROVAL_REQUIRED` request for the Board.

### 27.2 Preflight Enforcement
Execution is blocked *before* the LLM is invoked:
1. **The Guard**: The `Orchestrator` calls `budgetService.isAllowed(agentId, tenantId)`.
2. **The Lock**: If the current monthly/lifetime balance >= budget, the request is rejected with `402 Payment Required`.
3. **The Unlock**: The Board must explicitly "Raise Budget" or "Override for this Run" to resume.

## 28. Multi-Tenant Data Isolation (The Drizzle Layer)

EdApex V2 enforces strict multi-tenancy at the repository level, ensuring that no agent or user can ever leak data across school boundaries.

### 28.1 Composite Index Optimization
- **Rule**: Every query MUST include `tenant_id`.
- **Indexing**: All D1/SQLite tables use composite primary keys or indexes starting with `(tenant_id, id)`.
- **Drizzle Middleware**: A custom Drizzle middleware (the `TenantGuard`) intercepts all `select`, `update`, and `delete` operations to inject the mandatory `eq(schema.tenant_id, ...)` filter.

### 28.2 Dialect-Agnostic Schema
While EdApex V2 runs on Cloudflare D1 (SQLite) in production, the schema remains compatible with MySQL and Postgres for hybrid deployments:
- **Polymorphic Constraints**: Instead of hard foreign keys for `owner_id`, use `owner_type` + `owner_id` strings to support broad entity mapping.
- **Migration Policy**: All migrations are managed via `pnpm wrangler d1 migrations apply --local` during development, ensuring the edge-native schema is always in sync.

## 29. Migration Strategy & Paperclip Decommissioning

Transforming V1 assets and logic into the V2 Agentic School.

### 29.1 The "Strangler" Pattern
- **Phase A (Co-existence)**: The Hono RPC bridge is deployed alongside legacy Paperclip controllers.
- **Phase B (Redirect)**: Core routes (`costs`, `heartbeat`) are pointed to the new `DomainServices`.
- **Phase C (Cleanup)**: Legacy Paperclip `server/src/services` are deleted once 100% of Task Agents are migrated to the HMAS Mastra SDK.

### 29.2 Data Backfill Protocol
1. **Model Map**: Map Paperclip `heartbeat_runs` -> EdApex `agent_runs`.
2. **Ledger Rollup**: Summarize historical Paperclip spend into the new `finance_events` as an `INITIAL_BALANCE` credit.
3. **Skill Porting**: Extract `SKILL.md` instructions from the Paperclip skill registry and register them in the Mastra `StandardAdapter` registry.

### 29.3 Dynamic Structural Mapping (Schema-Agnostic Execution)
EdApex V2 physically deletes the concept of hardcoded "terms", "grades", or "compulsory rules" from the database.
- **Structure-as-a-Skill**: Educational constructs (e.g., Nigerian 6-3-3-4 or UK A-Levels), school policies, school handbooks (e.g., student handbook, staff handbook, parent handbook, etc.), penalties, enforcement triggers, and academic calendars are codified solely as Mastra AI Skills.
- **Orchestration**: The `Executive Orchestrator` loads the tenant's exact structural and operational skills at boot, merging them into the context window. It teaches the PBAC, Finance, and Domain Supervisors how to enforce specific guidelines, calculate penalties, and manage school operations entirely dynamically, avoiding schema locking.

## 30. PBAC Policy Reference (JSON Schemas)

EdApex V2 utilizes a centralized policy registry in D1/MySQL/PostgreSQL/KV.

```json
{
  "policyId": "P-REG-001",
  "name": "Registrar Enrollment Access",
  "actor": {
    "role": "REGISTRAR",
    "tenant_id": "uuid"
  },
  "action": "academic.enroll",
  "resource": "student_records",
  "conditions": {
    "ip_whitelist": ["10.0.0.*"],
    "requires_mfa": true
  },
  "effect": "ALLOW"
}
```

## 31. Local-First Conflict Resolution Strategies

The `SyncEngine` handles multi-device synchronization using these prioritized strategies:

1.  **LWW (Last Write Wins)**: Default for non-financial metadata (e.g., UI preferences).
2.  **Semantic Merge**: Used for WorkProducts (Markdown). EdApex utilizes a "Diff-Match-Patch" approach to merge concurrent agent edits.
3.  **Strict Transactional**: Used for the **Finance Ledger** and **Atomic Checkout**. Conflict returns `409 Conflict` and requires a fresh heartbeat turn with a re-fetched state.

## 32. Standardized Prompt Registry (Metadata Schema)

All agent prompts in EdApex V2 are versioned and stored as **Prompt Assets**.

```json
{
  "promptId": "PR-ACAD-01",
  "version": "1.2.0",
  "domain": "ACADEMIC",
  "role": "REGISTRAR",
  "template": "You are the EdApex Registrar. Your goal is to {{task}} for student {{studentId}}...",
  "metadata": {
    "provider_optimized": ["anthropic", "google"],
    "max_output_tokens": 1024,
    "temperature": 0.2
  },
  "delta_optimized": true
}
```

## 33. Edge Infrastructure Lifecycle (Hardware & Vitals)

While EdApex V2 is "Edge-First" (Cloudflare), it supports local school clusters (On-prem Edge) with the following vitals monitoring:

- **CPU Utilization**: Monitored at the Hono middleware level. Alerts at >85%.
- **D1 Storage Pressure**: Proactive archiving to R2 when the D1 SQLite file exceeds 400MB.
- **KV Consistency**: Weekly reconciliation between Edge KV (fast-path) and D1 (source of truth).

### 33.1 Recommended Edge Hardware Specs (On-Prem Clusters)

| Component | Minimum Spec | Recommended | Purpose |
| :--- | :--- | :--- | :--- |
| **CPU** | 4 Cores (ARM64) | 16 Cores | Parallel tool execution & Sync local-DB. |
| **RAM** | 8 GB | 32 GB | In-memory KV caching and prompt buffers. |
| **Disk** | 256 GB SSD | 1 TB NVMe | D1 local cache & R2 local buffer storage. |
| **Network** | 100 Mbps | 1 Gbps | Real-time sync with Cloudflare Edge. |

## 34. Stateless Heartbeat Error Recovery Matrix

Common failures in the stateless heartbeat loop and their automated resolutions:

| Error Code | Root Cause | Automated Recovery Action |
| :--- | :--- | :--- |
| `ERR_CHECKOUT_TIMEOUT` | Agent died mid-turn. | Domain Supervisor forces a "Re-Trigger" after 30s. |
| `ERR_TOKEN_EXHAUSTED` | Budget policy hit. | Move run to `PAUSED`; notify Board; stop all tool loops. |
| `ERR_D1_READ_ONLY` | Edge database lock. | SyncEngine buffers to IndexedDB; retries with jitter. |
| `ERR_PBAC_DENIED` | Policy violation. | Log security event; kill run; rotate agent credentials. |

## 35. V2 Integration Checklist (Developer Handover)

Follow this sequence to initialize a new Agentic School tenant:

- [ ] **Infrastructure**: Run `pnpm wrangler d1 migrations apply edapex_db --local`.
- [ ] **Registry**: Register at least one `StandardAdapter` via `StandardAdapterRegistry.register()`.
- [ ] **Governance**: Create the initial `SCHOOL.md` and `AGENTS.md`- [ ] **Middleware**: Verify `TenantGuard` and `Auth` injection in [app.ts](src/app.ts).
- [ ] **Validators**: Map all agent tool outputs to [validators/](src/validators/) Zod schemas.
- [ ] **Domain**: Ensure the `IRepository<T>` covers the new domain tables.
- [ ] **Sync**: Initialize the `TanStack DB` collection with the matching D1 schema.
- [ ] **Events**: Register domain-specific handlers in the [events/](src/events/) layer.
- [ ] **Pulse**: Enable the `Heartbeat` stream in the Command Center properties panel.

## 36. 18-Domain Drizzle Schema Reference (Cross-Walk)

| V2 Domain | Drizzle Schema File (src/db/sqlite/) | Primary Table Export |
| :--- | :--- | :--- |
| **Academic** | `domain-academic.ts` | `enrollments`, `classes` |
| **AI** | `domain-ai.ts` | `aiAgents`, `aiAgentActions` |
| **Assessment** | `domain-assessment.ts` | `exams`, `computedResults` |
| **Attendance** | `domain-attendance.ts` | `attendanceLogs` |
| **Classroom** | `domain-classroom.ts` | `classroomSessions`, `classroomMemoryLedger`, `classroomParticipants`, `classroomWhiteboardState` |
| **CMS** | `domain-cms.ts` | `pages`, `newsPosts` |
| **Communication**| `domain-communication.ts` | `broadcasts`, `threads` |
| **Core** | `domain-core.ts` | `tenants`, `users` |
| **Documents** | `domain-documents.ts` | `documents` (Polymorphic) |
| **Events** | `domain-events.ts` | `schoolEvents` |
| **Facilities** | `domain-facilities.ts` | `assets`, `maintenanceLogs` |
| **Finance** | `domain-finance.ts` | `ledgerEntries`, `invoices` |
| **Homeschool** | `domain-homeschool.ts` | `homeschoolRecords` |
| **HR** | `domain-hr.ts` | `staffProfiles` |
| **Library** | `domain-library.ts` | `resources`, `loans` |
| **LMS** | `domain-lms.ts` | `courses`, `modules` |
| **PBAC** | `domain-pbac.ts` | `policies`, `roleGrants` |
| **Settings** | `domain-settings.ts` | `schoolConfigs` |

## 38. Canonical Directory Structure (The 18-Domain Layout)

To ensure 100% logic parity and strict adherence to the **Backend Feasibility & Risk Index (BFRI)**, EdApex V2 employs the following standardized hierarchy:

```bash
src/
├── config/              # Centralized environment & AI unifiedConfig
├── controllers/         # Hono route handlers (req/res) via BaseController
├── services/            # Framework-agnostic business logic & AI orchestration
├── domain/              # Anti-Corruption Layer (Interfaces & Repositories)
│   ├── interfaces/      # e.g., core.interface.ts, ai.interface.ts
│   └── repositories/    # Drizzle ORM concrete implementations (mysql, postgres, sqlite)
├── db/                  # Drizzle schemas, relations, and migrations
├── routes/              # Hono route definitions
├── middleware/          # Auth, TenantGuard, PBAC, Rate Limiting
├── validators/          # Zod schemas for pre-flight input validation
├── events/              # Internal Event Bus & reactive trigger definitions
├── types/               # Shared TypeScript types & Enums
├── utils/               # Helpers, loggers, formatting
├── tests/               # Unit, Integration, and E2E specs
├── instrument.ts        # Observability & Tracing setup
├── app.ts               # Hono App instance configuration
└── server.ts            # Bootstrapper & Dependency Injection
```

### 38.1 Edge Rate Limiting & DDoS Protection (Availability)
To protect Cloudflare D1 quotas and AI token budgets from malicious floods, the `middleware/` layer enforces distinct Rate Limiting ceilings:
- **Human Interfaces**: 50 req/min limits (Standard).
- **Agent Interfaces**: 1,000 req/min limits (Mastra Orchestration/System).
Violations yield a `429 Too Many Requests` response, halting execution pre-flight before any Cloudflare AI inference costs are incurred.

## 39. Implementation Detail: The Directory Flow
- **Request Handlers**: All UI interactions (Agent Pulse, Artifacts) enter via `controllers/`.
- **Orchestration**: The `MASTRA_ORCHESTRATOR` lives in `services/`, acting as the supervisor of all domain agents.
- **Data Persistence**: All agentic state changes pass through the `validators/` before hitting the `domain/repositories/`.
- **Reactive Backbone**: The `events/` directory manages the decoupling of agent actions from high-latency side effects (notifications, audits).

## 41. Logging & Traceability (8-Layer Namespacing)

To achieve granular visibility into the Agentic School's internal operations, EdApex V2 enforces standardized structured logging across the entire stack.

- **Layer-Mandated Namespacing**: Every log entry includes a mandatory `layer` tag, identifying its origin from the 8 canonical layers (`db`, `config`, `controllers`, `services`, `domain`, `middleware`, `validators`, `events`).
- **Orchestration Trace**: All logs related to a specialized HMAS task share a common `run_id`, allowing developers to filter the entire "Chain of Thought" and execution trace in a single view.
- **Backend Implementation**: A Cloudflare-optimized structured JSON logger (`src/utils/logger.ts`).
  - Usage Example: `logger.child({ layer: 'services', domain: 'finance' })`.

## 42. Error Propagation & Resilience Pattern

Every error follows a type-safe resilience chain from the persistent storage to the user-interface:

1.  **Repository/Service**: Throws a specialized `DomainError` or `ValidationError` with a clear machine-readable code.
2.  **Controller**: Inherits from `BaseController` which catches unhandled exceptions and maps them to standardized Hono JSON envelopes (Hono RPC).
3.  **Frontend (TanStack Query)**: A global interceptor in the Query Client catches error responses and maps them to the **UI Notification System**.

## 43. Notification System (Toasts & Push)

- **Frontend Toasts (Sonner/Shadcn)**: Immediate, high-visibility feedback for human-triggered actions and critical agentic outcomes.
- **Agent Pulse Toasts**: Low-priority "Ghost" notifications in the property panel that visualize granular agent heartbeat ticks without cluttering the main thread.
- **Reactive Push**: The `Internal Event Bus` triggers the `Communication Service` to dispatch WebPush or SMS alerts for high-urgency reactive events (e.g., `ON_PBAC_VIOLATION`).

## 44. Proactive AI Issue Tracking

The Agentic School is self-healing via the **IT Supervisor's Auditor Agents**:

- **Anomaly Detection**: Background agents scan the `cost_events` and `agent_runs` tables for failed tokens or frequent status errors.
- **Audit Proposals**: When a pattern is detected (e.g., "Recursive tool error in HR Domain"), the AI Auditor creates a `SECURITY_INCIDENT` or `SYSTEM_ISSUE` WorkProduct in the **Board Command Center**.

## 45. Conclusion: Towards the Autonomous School

The transformation of EdApex V2 into an Agentic School represents a paradigm shift in educational infrastructure. By synthesizing local-first performance, hierarchical multi-agent orchestration, and strict financial governance, we provide a robust, build-ready blueprint for the future of school management...
