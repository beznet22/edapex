# EdApex V2: The Agentic School - Master Architecture Blueprint

## 1. Document Role & Scope

This document is the **definitive technical specification** for transforming EdApex V2 into an autonomous "Agentic School." It serves as the concrete, build-ready contract for the V2 evolution, synthesizing Paperclip's orchestration engine, governance models, and financial ledgers into EdApex's multi-tenant, multi-dialect, Hono-driven architecture.

### 1.1 Source Inputs
- `docs/MASTER_ARCHITECTURE.md`: Core system philosophy and stack.
- `docs/BUSINESS_MODEL.md`: Dual-pillar B2B/B2C alignment.
- `paperclip/doc/SPEC-implementation.md`: Orchestration and heartbeat template.
- `docs/domains/*.md`: Domain-specific business logic and entities.
- `paperclip/doc/spec/agent-runs.md`: Agent runs and cost tracking.
- `paperclip/doc/spec/agents-runtime.md`: Agent runtime and cost tracking.
- `paperclip/doc/plans/[DATE]-*.md`: Implementation plans and plus cost tracking.

### 1.2 Internal Service Architecture (Detailed)

```text
+-----------------------------------------------------------------------+
|                       UI: COMMAND CENTER (AI-ELEMENTS)                |
+-----------------------------------------------------------------------+
           ^                                         ^
           | Hono RPC (hc) / WebSockets              | TanStack DB Sync/Master Tooling
           v                                         v
+-----------------------+      +----------------------------------------+
|   HONO CONTROLLERS    | <--> |        MASTRA ORCHESTRATOR             |
| (BaseController Pattern)|      | (Agents, Workflows, Prompt Engine)     |
+-----------------------+      +----------------------------------------+
           |                                         |
           +--------------------+--------------------+
                                |
           v                    v                    v
+-----------------------+ +-----------------------+ +-----------------------+
|   DOMAIN SERVICES     | |   ROUTINE ENGINE      | |   ADAPTER REGISTRY    |
| (Registrar, Bursar,   | | (Cron, Event Triggers,| | (Claude, GPT, Gemini, |
|  IT, HR Logic)        | |  Atomic Checkout)     | |  Unified Interface)   |
+-----------------------+ +-----------------------+ +-----------------------+
           |                    |                    |
           +----------+---------+----------+---------+
                      |                    |
                      v                    v
           +-----------------------+ +-----------------------+
           |   DRIZZLE REPOSITORIES| |      COMPANY SECRETS  |
           | (IRepository<T>,      | | (Encrypted Injection) |
           |  Tenant Isolation)    | |                       |
           +-----------------------+ +-----------------------+
                      |                    |
            +---------+---------+----------+---------+
            |                   |                    |
         [MYSQL]             [POSTGRES]          [D1 / SQLITE]
```

### 1.3 Strategic Org Chart (HMAS Visualization)

```text
       [  Principal Assistant (Executive)  ] <--- (Administrator/Board)
                  |
        +---------+---------+
        |                   |
 [Academic Sup.]     [Finance Sup.]      [IT Supervisor]
        |                   |                  |
   +----+----+         +----+----+        +----+----+
   |         |         |         |        |         |
[Registrar][HOD]    [Bursar][Acct]    [AI Ops][DevOps]
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

1.  **Trigger**: A signal is enqueued in `agent_wakeup_requests` (via Cron, Webhook, or Edge Event).
2.  **Checkout**: A Domain Supervisor performs an **Atomic Checkout**, obtaining a distributed lock and assigning a unique `run_id`.
3.  **Execution**: The Mastra Agent hydrates context and invokes specialized Tools (validated against JSON schemas) via the Repository layer.
4.  **Governance**: High-impact actions (deletions, high-cost turns) are paused for **Board Inbox** manual approval.
5.  **Artifact**: The agent delivers a `WorkProduct` (artifact), persists logs, and releases the checkout lock.

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
- **Repository Pattern**: Multi-dialect support with strict isolation per domain (17 domains).
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

### 5.4 Unified Agent Lifecycle (State Machine)
All Agents in EdApex V2 follow a strict state transition model:
- `IDLE`: Registered but awaiting heartbeat/task.
- `AWAKE`: Heartbeat triggered; performing context retrieval.
- `RUNNING`: Executing tools; periodic status reports.
- `PAUSED`: Execution suspended by board or budget limit.
- `ERROR`: Terminal execution failure; requires manual reset.
- `TERMINATED`: Decommissioned.

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

## 7. Canonical Data Model (V2)

All tables MUST include `tenant_id` (uuid), `id` (uuid), `created_at`, and `updated_at`.

### 7.1 Core Orchestration Tables

#### `agent_runs` (replaces Paperclip `heartbeat_runs`)
- `id` uuid pk
- `tenant_id` uuid not null
- `agent_id` uuid fk not null
- `status` enum: `queued | running | succeeded | failed | cancelled`
- `invocation_type` enum: `scheduler | manual | event`
- `started_at` timestamptz null
- `finished_at` timestamptz null
- `context_snapshot` jsonb null (Thin vs Fat mode)

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

### 7.2 Work Product & Document System

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

## 9. Domain-Tool Mapping (The 17 Pillars & 31+ Skills)

Roles are grouped by Domain and implemented as **Standard Educational Skills**. Every domain exposes a set of tools to the HMAS via the **Domain Supervisor**.

| Domain | Key Roles | Supervisor Role | Responsibilities | Primary Agent Tools |
| :--- | :--- | :--- | :--- | :--- |
| **Core** | Principal, Board Sec.| Principal Assistant | Strategic goals, Tenant health, Board comms. | `get_school_info`, `set_goal`, `audit_health` |
| **Academic** | Registrar, HOD, Teacher Asst, Evaluator. | Academic Head | Student records, Lesson Plans, Grading, Student Analytics. | `enroll_student`, `grade_work`, `lesson_plan` |
| **Finance** | Bursar, Accountant, Auditor, Payroll. | Bursar | Fees, Ledgers, Tax compliance, Budget Oversight. | `collect_fees`, `audit_ledger`, `process_payroll` |
| **IT/Ops** | AI Ops, DevOps, Librarian, Asset Mgr. | IT Supervisor | Infra, Data Security, Resource Inventory, Cataloging. | `check_health`, `rotate_keys`, `search_archive` |
| **HR/Admin** | HR Mgr, Compliance, Safety, PR. | HR Manager | Staff mgmt, Policy, Communications, Safety Audits. | `hire_staff`, `track_attendance`, `broadcast` |
| **LMS** | Course Designer, Proctor. | Course Designer | Content publishing, Enrollment, Performance assessment. | `create_module`, `generate_quiz`, `monitor_exam` |
| **PBAC** | Compliance Officer, Auditor. | Compliance Officer | Policy evaluation, Role granting, Permission auditing. | `evaluate_policy`, `grant_role`, `audit_perms` |
| **Attendance**| Safety Officer, Sentinel. | Safety Officer | Presence verification, Absence flagging, Daily rollups. | `verify_presence`, `flag_absence`, `daily_rollup` |
| **Facilities** | Asset Manager, Clerk. | Asset Manager | Inventory tracking, Room booking, Maintenance scheduling. | `track_inventory`, `book_room`, `schedule_mtce` |
| **Documents** | Registrar, Archivist. | Registrar | Record archiving, Certificate generation, Digital signing. | `archive_record`, `generate_cert`, `sign_doc` |
| **Homeschool**| Home Mentor, Facilitator. | Home Mentor | Personalized paths, Payouts, Parent portal synchronization. | `create_path`, `payout_facilitator`, `parent_sync` |

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

## 11. Professional Code Flow (The 5-Phase Lifecycle)

To ensure consistency across 17+ domains, all Agentic operations must follow the **Standard Orchestration Cycle**.

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
    - `comm.sendSmartBroadcast(segment, message)`: Uses LLM to personalize tones for specific groups.
    - `comm.moderateCommunityFeed(feedId)`: Flags inappropriate content based on school values.
    - `comm.draftNewsletter(weekNumber)`: Summarizes WorkProducts from Academic and Events domains.
- **Reporting Line**: Reports to HR/Admin Supervisor.

### 13.4 IT & Operations Domain (The Engine Room)

#### 13.3.4 Safety Officer
- **Purpose**: Autonomous monitoring of campus safety and entry logs.
- **Mastra Tools**:
    - `safety.getEntryLogs(gateId, date)`: Scans IoT entry events for unauthorized access.
    - `safety.flagSecurityAnomaly(pattern)`: LLM-based pattern matching on gate activity.
    - `safety.generateIncidentReport()`: Produces a WorkProduct for the Board.
- **Reporting Line**: Reports to HR/Admin Supervisor.

#### 13.3.5 Sentinel Agent (B2C/Homeschool)
- **Purpose**: Monitoring student engagement and physical wellbeing in remote settings.
- **Mastra Tools**:
    - `sentinel.checkVitals(studentId)`: Integrates with wearable health data (placeholder).
    - `sentinel.trackScreenTime(studentId)`: Analyzes LMS interaction frequency.
    - `sentinel.emitParentAlert(urgency, details)`: Direct communication to the Parent Portal.
- **Reporting Line**: Reports to Home Mentor.

### 13.4 IT & Operations Domain (The Engine Room)

#### 13.4.1 AI Ops (The Orchestrator Assistant)
- **Purpose**: Technical maintenance of the Agentic School's HMAS loop.
- **Mastra Tools**:
    - `it.checkAgentHealth(agentId)`: pings the heartbeat endpoint and checks run logs.
    - `it.rotateAPIKeys(agentId)`: Triggers hash update in `agent_api_keys`.
    - `it.purgeOldRuns(days)`: Optimizes D1 storage by archiving succeeded runs.
- **Reporting Line**: Reports to IT Supervisor.

#### 13.4.2 DevOps Agent
- **Purpose**: Infrastructure management and deployment automation.
- **Mastra Tools**:
    - `it.deployStaticNotice(contentId)`: Updates the CMS domain via R2.
    - `it.scaleWorkerCapacity(params)`: Adjusts Cloudflare Worker limits (Simulated).
    - `it.monitorD1Storage()`: Alerts on capacity thresholds for the local/edge DB.
- **Reporting Line**: Reports to IT Supervisor.

#### 13.4.3 Librarian (The Knowledge Custodian)
- **Purpose**: Management of the school's digital and physical archives.
- **Mastra Tools**:
    - `library.catalogWorkProduct(productId)`: Tags artifacts with searchable vector metadata.
    - `library.searchArchive(query)`: High-performance semantic search across old documents.
    - `library.trackResourceLoan(studentId, resourceId)`: Manages the checkout state of school assets.
- **Reporting Line**: Reports to IT Supervisor.

#### 13.4.4 Asset Manager (Facilities)
- **Purpose**: Inventory and maintenance of physical school assets.
- **Mastra Tools**:
    - `facilities.getInventoryCount(itemId)`: Queries the local D1 inventory table.
    - `facilities.reportDamagedAsset(assetId, details)`: Creates a maintenance ticket Trigger.
    - `facilities.scheduleRoom(classId, roomId, time)`: Prevents schedule conflicts via calendar domain.
- **Reporting Line**: Reports to IT Supervisor.

#### 13.4.5 Clerk Agent
- **Purpose**: Managing the physical document archive and request queue.
- **Mastra Tools**:
    - `clerk.processDocumentRequest(requisitionId)`: Validates PBAC for record release.
    - `clerk.digitizeRecord(fileUri)`: Triggers OCR and vector ingestion via Librarian.
    - `clerk.generateBarcode(entityId)`: Creates physical tracking identifiers.
- **Reporting Line**: Reports to Asset Manager.

## 14. Technical Enhancements: The Edge-Native Evolution

EdApex V2 transforms stagnant Paperclip logic into a dynamic, edge-native system.

### 13.5 LMS & Content Domain (The Digital Campus)

#### 13.5.1 Course Designer
- **Purpose**: Authoring and aligning courses with NERDC standards.
- **Mastra Tools**:
    - `lms.createModule(courseId, content)`: Uses LLM to structure markdown content into logical units.
    - `lms.generateQuiz(moduleId)`: Produces assessment questions based on module content.
    - `lms.publishToCMS(courseId)`: Bridges LMS content to the public-facing school website.
- **Reporting Line**: Reports to Academic Supervisor.

#### 13.5.2 Proctor Agent (V2)
- **Purpose**: Monitoring online exams and flagging integrity issues.
- **Mastra Tools**:
    - `lms.monitorWindowFocus(sessionId)`: Scans for browser-tab switching events.
    - `lms.analyzeSubmissionSpeed(sessionId)`: Flags answers submitted faster than human reading limits.
    - `lms.logPlagiarismScore(submissionId)`: Cross-references session content with the Library archive.
- **Reporting Line**: Reports to Assessment Evaluator.

#### 13.5.3 Content Head
- **Purpose**: Strategic oversight of the school's public digital presence.
- **Mastra Tools**:
    - `cms.updateNewsfeed(headline, body)`: Publishes to the school's mobile app and web portal.
    - `cms.moderateComments(filter)`: Uses NLP to remove toxic community interactions.
    - `cms.generateSEOReport()`: Optimizes public pages for parent discovery.
- **Reporting Line**: Reports to IT Supervisor.

### 13.6 Homeschooling & B2C Domain (The Parent Portal)

#### 13.6.1 Home Mentor
- **Purpose**: Personalized academic coaching for distance learners.
- **Mastra Tools**:
    - `homeschool.createPath(studentId, goals)`: Generates a bespoke 12-week learning roadmap.
    - `homeschool.scheduleSync(studentId, parentId)`: Coalesces calendars for live mentor sessions.
    - `homeschool.recommendSupplements(studentId)`: Suggests third-party resources based on performance gaps.
- **Reporting Line**: Reports to Principal Assistant.

#### 13.6.2 Facilitator Agent
- **Purpose**: Managing the logistics of physical homeschool clusters.
- **Mastra Tools**:
    - `homeschool.payoutFacilitator(facilitatorId)`: Calculates commissions based on cluster size.
    - `homeschool.auditVenueSafety(venueId)`: Verifies facility compliance for regional meetups.
    - `homeschool.trackKitInventory()`: Manages the distribution of physical learning kits.
- **Reporting Line**: Reports to HR/Admin Supervisor.

#### 13.6.3 Parent Portal Sync
- **Purpose**: Ensuring real-time synchronization between school records and parent dashboards.
- **Mastra Tools**:
    - `parent.pushDailySummary(studentId)`: Summarizes attendance, marks, and behavioral highlights.
    - `parent.collectFeedback(studentId)`: Ingests parent concerns into the PR domain queue.
    - `parent.requestApproval(studentId, actionId)`: Sends push notifications for field trips or medical consent.
- **Reporting Line**: Reports to PR Officer.

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
- `ON_STUDENT_ENROLLED`: Triggers the Accountant to issue a tuition invoice and moves the student into the `Admissions` domain workflow.
- `ON_COST_THRESHOLD_EXCEEDED`: Triggers the AI Auditor to pause non-essential runs and notify the Finance Supervisor.
- `ON_PBAC_VIOLATION`: Triggers immediate Board notification, Agent lockdown, and creates a `SECURITY_INCIDENT` WorkProduct.
- `ON_LMS_SCORE_LOW`: Triggers a Curriculum Head to review the recent Assessment evaluator logs and suggest a "Personalized Path".
- `ON_FACILITY_DAMAGED`: Triggers the Asset Manager to create a maintenance ticket and notify the Facilities Supervisor.

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
1. **Scoping**: Scans the `library` for all recent `WorkProducts` (artifacts) across Academic and LMS domains.
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

## 24. Performance & Scalability (V2 Metrics)

- **Max Latency (Client)**: 50ms (Optimistic Update via TanStack DB).
- **Max Latency (Sync)**: 200ms (Hono RPC to D1).
- **Max Concurrency**: 5,000 active agents per tenant cluster.
- **Storage Strategy**: D1 for relational state; R2 for artifact blobs; KV for fast-path policy evaluation.
- **Availability Target**: 99.9% uptime for the Edge HMAS bridge.

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

## 30. PBAC Policy Reference (JSON Schemas)

EdApex V2 utilizes a centralized policy registry in D1/KV.

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
- [ ] **Governance**: Create the initial `SCHOOL.md` and `AGENTS.md` manifests in the tenant root.
- [ ] **Sync**: Initialize the `TanStack DB` collection with the matching D1 schema.
- [ ] **Pulse**: Enable the `Heartbeat` stream in the Command Center properties panel.

## 36. Conclusion: Towards the Autonomous School

The transformation of EdApex V2 into an Agentic School represents a paradigm shift in educational infrastructure. By synthesizing local-first performance, hierarchical multi-agent orchestration, and strict financial governance, we provide a robust, build-ready blueprint for the future of school management. Every line in this specification is designed to bridge the gap between static business logic and proactive, AI-driven educational optimization.
