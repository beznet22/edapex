# Core Domain Architecture

## Overview
The Core domain is the foundation of the EdApex Planet-Scale Architecture. It manages multi-tenancy (Tenants), the separation of platform identity from school-level personas (Accounts & Users), and the temporal context (Academic Years). It provides the "Hull" within which all other domain modules operate.

### Key Business Logic
- **Tenant Hull Design**: Every school/campus is a standalone tenant. All data is logically isolated via `tenantId`.
- **Identity vs. Persona**: Platform identity (`accounts`) is decoupled from domain personas (`users`). This allows for unified authentication while supporting multiple roles (Student, Staff, Parent) per user.
- **Academic Context**: All academic operations are scoped to an `academicYearId`, ensuring historical data integrity and session-based logic.

---

## Entity Mapping (V1 -> V2)

| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-core.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_schools` | `tenants` | Centrally managed school entities. |
| `users` | `accounts` | Authentication identity layer. |
| `users` (Roles/Personas) | `users` | Domain-specific personas (Student, Staff, Parent). |
| `sm_academic_years` | `academicYears` | Temporal session control. |
| `sm_base_setups` | `enumerations` | Centralized taxonomy mapping (Gender, Blood Group, etc.). |

---

## AI Agent & Tool Integration

### Task Agents
- **Identity Provisioner**: Manages the creation of accounts and the linking of personas based on roles.
- **Tenant Architect**: Handles the initialization of new tenants, branding set-up, and module enablement.

### Multi-Agent Tools
- `provision_account.tool`: Creates platform-level `accounts` and initiates `users` personas.
- `resolve_tenant_context.tool`: Injects `tenantId` and `academicId` into request lifecycles.
- `manage_enumerations.tool`: Handles global vs tenant-specific taxonomy.

---

## PBAC & Security

### Policy Enforcement
- **Tenant Isolation**: Every query is implicitly filtered by `tenantId`. A `SchoolAdmin` can only access accounts and users where `tenantId` matches their signed-in context.
- **Identity Separation**: Users cannot access platform-level `accounts` metadata (like `stripeId`) unless they have `SystemAdmin` privileges.
- **Self-Service**: Students/Parents can only read/update their specific persona `metadata` in the `users` table.

---

## Recommendations & Justifications

### 1. Tenant-Level Feature Flags
**Proposal**: Introduce a `tenant_features` entity or extend `tenants.metadata` to store active modules.
- **Justification**: Replaces the legacy `ModulePermissionMiddleware` check (`isModuleForSchool`). This allows for dynamic, subscription-tier-based feature enablement at the Edge.

### 2. Multi-Persona Linking
**Proposal**: Formalize the link between a single `account` and multiple `users` personas across different tenants.
- **Justification**: Currently, `accounts` table contains `tenant_id`. To support a true "Platform User" who might be a teacher in School A and a parent in School B, the `tenant_id` should move from `accounts` to a junction table or solely reside in the `users` table.

### 3. Enumeration Scoping
**Proposal**: Ensure `enumerations` strictly follow the `tenantId = NULL` for global defaults and `tenantId = ID` for tenant-specific overrides.
- **Justification**: Allows schools to define custom categories (e.g., custom Student Categories) without polluting the global taxonomy.

---

## Identity Workflow Diagram
```mermaid
graph TD
    A[Public Web/Mobile] --> B{Edge Gateway}
    B -->|Resolve Tenant| C[tenants]
    B -->|Authenticate| D[accounts]
    D -->|Persona Lookup| E[users]
    E -->|Role: Student| F[Student Dashboard]
    E -->|Role: Teacher| G[Staff Dashboard]
    E -->|Role: Admin| H[Management Console]
```
