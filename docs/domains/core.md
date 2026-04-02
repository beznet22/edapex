# Core Domain Architecture

## Overview
The Core domain is the foundation of the EdApex Planet-Scale Architecture. It manages multi-tenancy (`tenants`), platform identity (`accounts`), domain personas (`users`), temporal sessions, centralized taxonomy (`enumerations`), and system job queues. Every other domain depends on Core for identity resolution and tenant scoping.

### Key Business Logic
- **Identity vs. Persona**: Platform identity (`accounts`) is decoupled from domain personas (`users`). A single account can have multiple personas (student, staff, parent) across different tenants.
- **Multi-Tenant Isolation**: Every query across all domains must include a `tenant_id` filter. Core provides the `TenantContext` interface injected into all repositories.
- **Enumeration Taxonomy**: Replaces scattered lookup tables (`sm_base_setups`, `sm_student_categories`) with a unified `enumerations` table supporting tenant-scoped and global entries.
- **Better-Auth Integration**: Authentication is handled via `accounts`, `sessions`, `authAccounts`, and `authVerifications` tables, supporting OAuth, Magic Links, and credential-based login.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-core.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_schools` | `tenants` | School → Tenant. Supports `conventional`, `homeschool_family`, `homeschool_coop` types. |
| `users` | `accounts` | Authentication identity layer. Better-Auth compatible. |
| `sm_students` / `sm_staffs` / `sm_parents` | `users` | Unified persona table with `userType` enum and JSON `metadata`. |
| `sm_academic_years` | `academicYears` | Cross-domain multi-year support with `isCurrent` flag. |
| `sm_base_setups` / `sm_base_groups` | `enumerations` | Centralized taxonomy with `domain` + `code` + `label`. |
| — (new) | `sessions` | Better-Auth session store. |
| — (new) | `authAccounts` | OAuth link & credential store (GitHub, Google, etc.). |
| — (new) | `authVerifications` | Magic link / OTP verification tokens. |
| — (new) | `userDocuments` | Verified identity documents (passport, ID). |
| — (new) | `userAddresses` | Address records (current, permanent, mailing). |
| `jobs` | `jobs` | System job queue for async processing. |
| `failed_jobs` | `failedJobs` | Failed job tracking for retry and debugging. |

### Critical Logic Parity
- **Persona Metadata**: Legacy stored role-specific fields in separate tables (`sm_students.admission_no`, `sm_staffs.joining_date`). V2 consolidates into typed JSON `metadata` (`StudentMetadata`, `StaffMetadata`, `ParentMetadata`, `DriverMetadata`, `FacilitatorMetadata`).
- **Parent-Child Linking**: Legacy used separate junction tables. V2 uses `users.parentUserId` self-referential FK.

---

## Technical Implementation

### Core Entities

#### [Tenants](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-core.ts#L47)
Multi-tenant root. Supports subscription tiers (`free`, `basic`, `premium`, `enterprise`) and JSON metadata for branding, timezone, and currency.

#### [Accounts](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-core.ts#L69)
Authentication identity. Better-Auth compatible with email/password, OAuth, and token-based flows.

> [!WARNING]
> Legacy fields (`stripeId`, `walletBalance`, `styleId`, `rtlLtl`) are scheduled for migration to their respective domains (Finance, Settings).

#### [Users (Personas)](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-core.ts#L204)
Domain-specific persona. `userType` enum: `student`, `staff`, `parent`, `driver`, `facilitator`. Linked to `accounts` via `accountId`.

#### [AcademicYears](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-core.ts#L231)
Temporal partitioning. All domain data is scoped to an academic year via `academicId`.

#### [Enumerations](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-core.ts#L252)
Centralized taxonomy. `domain` field (e.g., `gender`, `blood_group`, `religion`) with unique constraint on `(tenantId, domain, code)`.

#### [Sessions / AuthAccounts / AuthVerifications](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-core.ts#L107)
Better-Auth session management, OAuth provider linking, and OTP/Magic Link verification.

#### [UserDocuments / UserAddresses](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-core.ts#L275)
Identity verification documents and address records with typed metadata.

#### [Jobs / FailedJobs](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-core.ts#L312)
System job queue for async processing and retry management.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `orchestrate.setGoal(tenantId, goal)`: Top-level goal decomposition to Domain Supervisors.
- `orchestrate.reportStatus(tenantId)`: Aggregates system health and domain status.
- `orchestrate.auditTenant(tenantId)`: Comprehensive tenant integrity audit.
- `validate_tenant_context`: Ensures `tenantId` + `academicId` are valid before any domain operation.
- `provision_persona`: Creates a new user persona and links to an existing or new account.
- `bulk_import_users`: Batch import of students/staff from CSV/JSON with deduplication.
- `generate_academic_year`: Initializes a new academic year with term configuration.

### [STRESS DEFENSE] Tools
- `idempotency_key_generator`: Prevents duplicate account/tenant creation during network retry storms.
- `bulk_import_reconciler`: Atomic reconciliation of large-scale identity imports (e.g. from legacy systems).
- `clock_sync_validator`: Detects and prevents temporal state corruption across distributed edge nodes.
- `partition_resilience_checker`: Ensures persona integrity when an edge node is isolated from the central identity hub.
- `atomic_state_checkpoint`: Captures consistent snapshots of tenant state before high-risk mutations.

---

## PBAC & Security
- **SuperAdmin**: Full control across all tenants (platform-level).
- **TenantAdmin**: Full control within their tenant scope.
- **Staff**: Can view tenant-scoped personas for their assigned classes/subjects.
- **Parent**: Can only view their linked children's personas.
- **Student**: Read-only access to their own persona.

---

## Hono API Routes

```
Routes → CoreController → CoreService → CoreRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/tenants/:id` | Get tenant details | Authenticated |
| `POST` | `/api/v1/tenants` | Create tenant | `SuperAdmin` |
| `GET` | `/api/v1/users` | List users by type | `TenantAdmin` |
| `POST` | `/api/v1/users` | Create user persona | `TenantAdmin` |
| `GET` | `/api/v1/users/:id` | Get user details | Self + `TenantAdmin` |
| `GET` | `/api/v1/academic-years` | List academic years | Authenticated |
| `POST` | `/api/v1/academic-years` | Create academic year | `TenantAdmin` |
| `GET` | `/api/v1/enumerations` | List enumerations by domain | Authenticated |
| `POST` | `/api/v1/enumerations` | Create enumeration | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `identity_provisioner` | Task | Account creation, persona linking, onboarding, bulk import |
| `tenant_architect` | Task | Tenant initialization, branding, subscription, checkpointing |
| `context_resolver` | Task | Injects tenantId + academicId + temporal validation |
| `principal_assistant` | Supervisor | Top-level orchestration, goal decomposition, audit |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `core.tenant_provisioned` | `{ tenantId, name, tier }` | Settings (config init), PBAC (default policies) |
| `core.user_created` | `{ userId, tenantId, userType }` | Communication (welcome), PBAC (default role), Finance (fee assignment) |
| `core.academic_year_activated` | `{ academicId, tenantId }` | All domains (context switch) |
| `core.bulk_import_completed` | `{ tenantId, count, type }` | Events (audit), Communication (admin notification) |
| `core.persona_linked` | `{ userId, accountId }` | PBAC (role sync) |
