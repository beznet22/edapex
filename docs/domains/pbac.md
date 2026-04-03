# PBAC (Policy-Based Access Control) Domain Architecture

## Overview
The PBAC domain is the dynamic enforcement engine for EdApex. It evaluates access decisions based on User Personas, Context (tenant, academic year), and **School-Level Operational Skills** (policies, handbooks). It replaces legacy hardcoded boolean permissions with attribute-based, JSON-defined policy rule sets.

### Key Business Logic
- **Dynamic Policies**: `policyDefinitions` store JSON rule sets with `effect` (allow/deny), `actions`, `resources`, and `conditions`. No schema changes needed to add new permissions.
- **Priority-Based Resolution**: When multiple policies match, higher `priority` wins. Explicit `deny` always overrides `allow`.
- **Role Assignment**: `roleAssignments` map users to role names (`admin`, `teacher`, `student`) with metadata for expiry and primary role tracking.
- **Policy Bindings**: M:N mapping between policies and role assignments enables dynamic PBAC: "role X gets policy Y in tenant Z".
- **Context Binding**: Policy conditions can reference structural context (e.g., `{ "structure": "6-3-3-4" }`) loaded from School Operational Skills.
- **[NEW] Professional Persona Flow (The Security Auditor)**: Mr. Okon, the Board's Internal Auditor, uses the Command Center to verify that no Teacher Agent has successfully accessed the Finance ledger. He triggers the `policy_auditor` to scan for "Role Expansion" attempts across 5,000 sessions. When the system detects a stale attribute bypass, it auto-emits a `pbac.access_denied` event, which Mr. Okon reviews via the Boneyard-powered forensic trace UI before the `principal_assistant` locks the affected persona.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-pbac.ts`) | Notes |
| :--- | :--- | :--- |
| `infix_roles` / `roles` | `roleAssignments` | Dynamic role-per-tenant assignments. |
| `sm_role_permissions` / `permission_sections` | `policyDefinitions` | JSON rule sets replace boolean matrices. |
| `infix_module_infos` / `sm_modules` | `policyDefinitions.resources` | Module access via resource patterns. |
| `infix_permission_assigns` / `assign_permissions` | `policyBindings` | M:N policy → role binding. |

---

## Technical Implementation

### Core Entities

#### [PolicyDefinitions](/home/beznet/Workspace/edapex/src/db/sqlite/domain-pbac.ts#L34)
JSON policy rule: `effect` (allow/deny), `actions[]`, `resources[]` (e.g., `student:*`, `finance:invoice`), `conditions[]`, `context{}`. Null `tenantId` = system-wide.

#### [RoleAssignments](/home/beznet/Workspace/edapex/src/db/sqlite/domain-pbac.ts#L57)
Maps `userId` (persona) + optional `accountId` (platform identity) to a `roleName`. Unique constraint on `(userId, roleName)`.

#### [PolicyBindings](/home/beznet/Workspace/edapex/src/db/sqlite/domain-pbac.ts#L74)
M:N junction between `policyDefinitions` and `roleAssignments`. Unique constraint on `(policyId, roleAssignmentId)`.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `pbac.evaluatePolicy(userId, resource, action)`: Core security clearance check.
- `pbac.grantRole(userId, role)`: Secure role assignment with administrative audit.
- `pbac.auditPerms(userId)`: Comprehensive permission scan for a specific user.
- `evaluate_access`: Resolves user roles → policies → conditions against request context.
- `provision_default_roles`: Auto-assigns default roles when a new persona is created.
- `detect_policy_conflicts`: Scans for contradictory allow/deny policies.
- `simulate_access`: Dry-run evaluation for policy testing before deployment.
- `inject_skill_context`: Loads School Policy Skills into evaluation context.

### [STRESS DEFENSE] Tools
- `rbac_boundary_enforcer`: Detects and blocks role expansion attempts.
- `policy_audit_logger`: Immutable capture of evaluation results for compliance.
- `guardian_access_filter`: Real-time enforcement of restricted boundary mapping.
- `least_privilege_enforcer`: Continuously prunes overlapping permissions.
- `audit_log_integrity_verifier`: Detects and flags audit log tampering attempts.

---

## PBAC & Security
- **SuperAdmin**: System-wide policy management.
- **TenantAdmin**: Tenant-scoped policy and role management.
- **All Evaluations**: Logged immutably for compliance auditing.
- **Deny-First**: Explicit deny always overrides any allow policy.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/policies` | List policy definitions | `TenantAdmin` |
| `POST` | `/api/v1/policies` | Create policy | `TenantAdmin` |
| `POST` | `/api/v1/evaluate` | Evaluate access (internal middleware) | Internal |
| `GET` | `/api/v1/roles` | List role assignments | `TenantAdmin` |
| `POST` | `/api/v1/roles` | Assign role to user | `TenantAdmin` |
| `POST` | `/api/v1/policies/simulate` | Dry-run access evaluation | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities | Link |
|:---|:---|:---|:---|
| `pbac_supervisor` | Supervisor | Policy loading from Operational Skills, conflict detection | [SOUL.md](../strategy/SOUL.md) |
| `policy_evaluator` | Task | Context-based access evaluation, condition matching | [SOUL.md](../strategy/SOUL.md) |
| `role_provisioner` | Task | Auto-assigns default roles on user creation | [SOUL.md](../strategy/SOUL.md) |
| `policy_auditor` | Task | Conflict loop detection, audit integrity verification | [SOUL.md](../strategy/SOUL.md) |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `pbac.access_denied` | `{ userId, resource, action, reason }` | Communication (alert), AI (threat analysis) |
| `pbac.role_assigned` | `{ userId, roleName, tenantId }` | Events (audit) |
| `pbac.policy_conflict_detected` | `{ policyIds, resource }` | Communication (admin alert) |
| `pbac.audit_tampered` | `{ logId, violationType }` | PBAC (lockout), Events (emergency) |

---

## UI Documentation (Boneyard)
- **Policy Management Console**: The PBAC editor MUST utilize `boneyard-js` skeletons for real-time policy evaluation previews.
- **Evaluation Trace**: High-density access logs must use "Refraction-Pro" glassmorphism cards for scannable security audits.
