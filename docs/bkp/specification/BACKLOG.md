# EdApex Granular Master Backlog

## 🟢 PHASE 1: SYSTEM FOUNDATION (CRITICAL)

### [CORE-01] Distributed Rust Workspace Architecture
*   **Reqs**: Initialize `/crates` with `shared_kernel`, `infra_postgres`, `identity`, `policy_engine`, and `domain_orchestrator`.
*   **Dev Spec**: Setup `workspace.members`. Implement `StudentId`, `TenantId`, `Money` as strictly typed Value Objects in `shared_kernel`.

### [DB-01] Multi-Tenant RLS Deployment
*   **Reqs**: Deploy the 3-schema foundation (`core`, `domain`, `ai`) with mandatory `tenant_id` on all tables.
*   **Dev Spec**: Implement PostgreSQL trigger to auto-populate `tenant_id`. Define RLS policies that enforce isolation using session configuration.

### [AUTH-01] Deterministic PBAC Policy Engine
*   **Reqs**: Rust implementation of the policy evaluator defined in `docs/PBAC.md`.
*   **Dev Spec**: Create `PolicyService` that loads rules from `core.policies`. Support attribute inheritance (Designations -> Roles).

### [AUTH-02] Department & Designation Resolver
*   **Reqs**: Logic to resolve the `Subject` attribute tree (Tenant -> Department -> Designation -> Role).
*   **Dev Spec**: Implement a caching layer in `identity_service` for high-speed attribute lookups during evaluation.

### [AUTH-03] Resource Attribute Mapper
*   **Reqs**: Middleware to extract resource attributes (owner_id, subject_id) from `domain` tables for policy comparison.
*   **Dev Spec**: Dynamic extraction from `domain.profiles.data`, `domain.assets.data`, and `domain.academics.config`.

---

## 🟡 PHASE 2: DOMAIN OPERATIONS & FIDELITY

### [STUDENT-01] Unified Entity Repository
*   **Reqs**: Implement the polymorphic storage for Students, Staff, and Guardians.
*   **Dev Spec**: Validation logic for JSONB `data` based on the `type` discriminator (JSonschema-rs).

### [ACADEMIC-01] Hierarchical Academic Router
*   **Reqs**: Recursive tree management for Classes/Sections/Subjects.
*   **Dev Spec**: Prevent circular parents. Implement "Deep Copy" for academic year transition (Student Promotion).

### [FINANCE-01] Precision Atomic Ledger
*   **Reqs**: Double-entry bookkeeping logic for all financial movements.
*   **Dev Spec**: Atomic transactions that update `domain.ledger` and `entities.data` (balance) simultaneously. Prevent overdrafts on student wallets.

---

## 🔴 PHASE 3: HMAS & AI INTEGRATION

### [AI-01] HMAS Orchestrator Level 1
*   **Reqs**: The "Brain" of the system. Intent parsing and plan generation.
*   **Dev Spec**: Implement the state machine that delegates intents to Domain Supervisors via `ai.threads`.

### [AI-02] Tool Execution Sandbox (Level 4)
*   **Reqs**: Safe execution environment for agents to call domain services.
*   **Dev Spec**: Enforce a mandatory PBAC check *before* any tool is executed against the database repo.

### [FED-01] Federated Learning Node Prototype
*   **Reqs**: Logic to generate anonymized model updates from local `activity_logs`.
*   **Dev Spec**: Implement "Gradient Masking" for privacy. Integration with the central `FederatedCoordinator`.

---

## 🟣 PHASE 4: BEYOND THE HORIZON (INNOVATION)

### [INNO-01] Emotional State Analysis Module
*   **Reqs**: Processor that scans interaction latency and click-intensity in `activity_logs`.
*   **Dev Spec**: Implement a "Fatigue Threshold" service. Output triggers an intervention task in the `Academic Supervisor`.

### [INNO-02] Autonomic Sustainability Tool
*   **Reqs**: Bridge between `domain.academics` (Timetable) and hypothetical IoT gateways.
*   **Dev Spec**: Logic to trigger "Eco Mode" events when real-time attendance in a room is 0 during its scheduled slot.

### [INNO-03] Federated Pedagogy Merging
*   **Reqs**: Global service to aggregate anonymized teaching patterns from top-tier schools.
*   **Dev Spec**: Extraction logic for topic sequencing and homework frequency. No PII data collection.

### [INNO-04] Skill-Based Badge Miner
*   **Reqs**: AI service to audit student artifacts and map to the Global Skill Tree.
*   **Dev Spec**: Auto-issuance of badges into `profiles.data` JSONB.
