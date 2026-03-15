# EdApex Master System Architecture

## 1. Unified Schema & High-Performance Data Layer
EdApex utilizes a consolidated 3-schema PostgreSQL 16+ architecture designed for planet-scale multi-tenancy.

### 🍱 Schema Architecture
*   **`core`**: Governance & Identity. Stores `tenants` (with deep JSONB config), `users`, `credentials`, and the `policies` (YAML-based PBAC rules).
### 🍱 `domain` Schema (Unified School Operations)
*   **Purpose**: Operational logic, logistics, and data persistence.
*   **Tables**: `profiles`, `assets`, `academics`, `ledger`, `activity_logs`.
*   **Polymorphic 'Profiles'**: Consolidates humans (Students, Staff, Guardians, etc.). Each profile can link to a `core.users` identity.
*   **Polymorphic 'Assets'**: Consolidates resources (Books, Vehicles, Inventory Items, etc.).
*   **Recursive 'Academics'**: A single-table hierarchy for Classes, Sections, Subjects, Exams, Routes, and Dorm Rooms.
*   **`ledger`**: Atomic ledger for all financial (Fees, Payroll) and inventory movements.
*   **`activity_logs`**: High-frequency partitioned logs for Attendance, Marks, and Behavioral events.
*   **`ai`**: Intelligence & Memory. Stores `threads`, `messages`, `memory` (pgvector), `tool_registry`, and `evolution_log`.

---

## 2. Hierarchical Multi-Agent System (HMAS)
EdApex implements a 4-level agent hierarchy to prevent "agent chaos" and ensure deterministic execution.

### Level 1: Executive Orchestrator
*   **Role**: Entry point for all user intents.
*   **Logic**: Parses natural language ➜ Generates multi-domain execution plan ➜ Delegates to Level 2 Supervisors.

### Level 2: Domain Supervisors
*   **Roles**: `Academic Supervisor`, `Finance Supervisor`, `Admin Supervisor`, `AI Evolution Supervisor`.
*   **Logic**: Manages domain-specific state and coordinates Task Agents.

### Level 3: Task Agents
*   **Roles**: `Admission Agent`, `Attendance Agent`, `Grading Agent`, `Payroll Agent`, `Route Optimizer`.
*   **Logic**: Specialised AI agents that execute specific administrative workflows.

### Level 4: Tool Executors (Deterministic)
*   **Logic**: Strictly validated Rust functions that interact with `domain` services.
*   **Constraint**: NO agent ever writes to the database directly; they must call a Tool.

---

## 3. Federated Multi-School Intelligence (FMSIA)
EdApex learns from all schools globally without sharing private data.

*   **Layer 1 (Local)**: School-specific insights (e.g., student failure risk).
*   **Layer 2 (Federated Node)**: Anonymized learning signals (gradients) are aggregated across schools.
*   **Layer 3 (Global)**: Benchmarked education models distributed back to all tenants.
*   **Privacy**: Enforced via **Differential Privacy** (adding noise to weights) and **Secure Aggregation**.

---

## 4. 🧠 Adaptive Memory Tiers
Agents utilize three distinct memory layers for high-context reasoning:
1.  **Conversation Memory**: Short-term chat history and session context.
2.  **Task Memory**: Intermediate results during long-running administrative workflows.
3.  **Institutional Memory**: School policies, historical performance, and cultural context stored in `ai.memory`.

---

## 5. Security: PBAC & RLS Enforcement
### Policy-Based Access Control (PBAC)
*   Authorization is dynamic and attribute-based.
*   **Flow**: `User + Action + Resource + Context` ➜ `Policy Engine` ➜ `Allow/Deny`.
*   Policies are stored in `core.policies` and evaluated deterministically by the Rust backend.

### Row-Level Security (RLS)
*   Every database query is tenant-isolated at the SQL layer.
*   Implementation: Postgres session variables `edapex.current_tenant_id` are set per transaction.

---

## 5. Deep Dive: PBAC Engine & Data Points
EdApex uses a deterministic Policy Engine to evaluate all actions against the following attribute-based data points.

### A. Subjects (The Who)
Subject attributes are retrieved from `core.users` and `core.credentials`.
*   **Roles**: `student`, `teacher`, `parent`, `accountant`, `admin`, `librarian`, `driver`, `warden`.
*   **Designations**: `principal`, `vice_principal`, `teacher`, `accountant`, `librarian`, `driver`, `warden`.
*   **Contextual Attributes**: `user.subjects` (list), `user.department`, `user.id`.

### B. Resources (The What)
Resource attributes are retrieved from the `domain` schema.
*   **Objects**: `student_record`, `exam`, `attendance`, `fees`, `library_book`, `inventory_item`, `homework_submission`.
*   **Attributes**: `resource.tenant_id`, `resource.subject_id`, `resource.owner_id` (e.g., student ID for a mark), `resource.status`.

### C. Actions (The How)
Actions are the "verbs" defined in policy rules and requested by the API or Agents.
*   **Standard**: `create`, `read`, `update`, `delete`.
*   **Operational**: `approve`, `grade`, `collect`, `assign`, `issue`, `return`.

### D. Environment (The Context)
Context metadata passed by the API Gateway to the Policy Engine.
*   **Attributes**: `time`, `location` (IP-based), `device` (Mobile/Web), `tenant_id`.

### E. Evaluation Logic
The `PolicyService (Rust)` evaluates rules stored in `core.policies` using the following flow:
1.  **Context Assembly**: Fetch subject attributes (role/department) and resource metadata.
2.  **Rule Match**: Filter `core.policies` by the requested `action` and `resource`.
3.  **Boolean Evaluation**: Evaluate the `condition` (YAML/JSON logic).
    *   *Example*: `ALLOW if user.role == "parent" AND resource.student.guardian_id == user.id`.

---

## 6. Detailed Business Logic Engines
EdApex implements three core "engine" patterns in the Rust backend to handle the complexity of the consolidated 3-schema design.

### A. Polymorphic Ingestion Engine
*   **Purpose**: Validates and transforms raw `JSONB` data in the `domain.profiles`, `domain.assets`, and `domain.academics` tables.
*   **Logic**:
    1.  **Discriminator Check**: Look at the `type` column (e.g., `student` or `inventory_item`).
    2.  **Schema Fetch**: Retrieve the corresponding `JSONSchema` from the `core.tenants.config`.
    3.  **Validation**: Use `jsonschema-rs` to validate the incoming `data` or `config` payload.
    4.  **Transformation**: Cast specific fields to Value Objects (e.g., `Money`, `Email`) before persistence.

### B. Recursive Academic Router
*   **Purpose**: Manages the multi-level education hierarchy without circular dependencies.
*   **Logic**:
    1.  **Traversal**: Breadth-first search for sibling nodes (e.g., all Sections in a Class).
    2.  **Inheritance**: Sub-entities (e.g., `subject`) automatically inherit `academic_year` and `tenant_id` from their parent class.
    3.  **Deep-Cloning**: During "Promotion," the router clones the previous year's `academics` structure for the new year, updating only the `id` and `academic_year_id`.

### C. Self-Evolution feedback Loop
*   **Purpose**: Allows the system to improve its own AI reasoning over time.
*   **Components**:
    1.  **Tool Registry**: A dynamic library of agent capabilities in `ai.tool_registry`.
    2.  **Evolution Agent**: A background task that analyzes `ai.evolution_log`.
    3.  **Logic**:
        *   If a tool fails 3+ times with "Incomplete Context," the Evolution Agent updates the tool's `description` field to better guide the Orchestrator.
        *   If a specific prompt triggers high user correction, the agent proposes a system prompt update in `evolution_log` for admin approval.

---

## 7. Planet-Scale Deployment & Scaling
*   **Regional Nodes**: Clusters deployed in Africa, Europe, Asia, etc.
*   **Regional Aggregators**: Federated model updates are merged regionally before a global sync.
*   **Partitioning**: `activity_logs` and `ledger` are partitioned by `tenant_id` and `created_at` for O(1) query performance at scale.

## 7. Next-Gen AI Innovations (Beyond the Horizon)
*   **Emotional AI**: Detecting student fatigue/engagement via LMS interaction patterns.
*   **Autonomic Sustainability**: AI-driven energy optimization based on real-time room occupancy.
*   **Synthetic Peers**: Generative personas for immersive academic roleplay.
