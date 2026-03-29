# Domain Architecture: PBAC (Policy-Based Access Control)

## 1. Overview
The **PBAC** domain in EdApex V2 represents a fundamental shift from static, role-based authorization (RBAC) to a dynamic, attribute-aware policy evaluation model. This domain replaces the legacy role/permission system with a planet-scale, multi-tenant policy engine that decouples access logic from application code.

### Paradigm Shift: RBAC to PBAC
| Feature | Legacy RBAC (Schoolify) | Modern PBAC (EdApex V2) |
| :--- | :--- | :--- |
| **Logic** | Fixed `User -> Role -> Permission` | Dynamic `User + attributes -> Policies -> Allow/Deny` |
| **Granularity** | Boolean flags on modules/actions | Fine-grained conditions (e.g., "only if student is in class X") |
| **Tenancy** | Hardcoded `school_id` checks in code | Native `tenant_id` isolation in policy definitions |
| **Storage** | Fragmented pivot tables (`sm_role_permissions`) | Unified JSON-based `policy_definitions` |

## 2. Legacy Logic Parity

### Entity Mapping
| Legacy Table | V2 Entity | Description |
| :--- | :--- | :--- |
| `infix_roles` | `role_assignments.roleName` | Legacy roles are mapped as flat string identifiers in V1 migration. |
| `permissions` | `policy_definitions.definition.actions` | Individual permissions (edit, view, delete) become policy actions. |
| `sm_role_permissions` | `policy_definitions` | Pivot logic is replaced by direct assignment of policies to identities/roles. |
| `infix_module_infos` | `policy_definitions.definition.resources` | Modules and sub-modules are treated as hierarchical resources. |

### Authorization Middleware
- **Legacy**: `UserRolePermission` and `ModulePermissionMiddleware` performed manual SQL lookups to verify permission booleans.
- **V2**: A central **Policy Evaluator** intercepts requests (at the API or Agent level), evaluating the `SubjectContext` against active `policy_definitions`.

## 3. Policy DSL Design
The `policy_definitions` table uses a JSON `definition` field to store complex access rules.

### DSL Structure
```typescript
export type PolicyDefinition = {
  effect: "allow" | "deny";
  actions: string[];     // ["read", "write", "delete", "execute"]
  resources: string[];   // ["finance:*", "student:123:profile", "lms:course:math"]
  conditions?: {
    field: string;
    operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
    value: any;
  }[];
};
```

### Example Policy: Teacher Grade Modification
```json
{
  "name": "Teacher Grade Mgmt",
  "definition": {
    "effect": "allow",
    "actions": ["write"],
    "resources": ["academic:grades:*"],
    "conditions": [
      { "field": "subject.persona", "operator": "eq", "value": "teacher" },
      { "field": "resource.classId", "operator": "in", "value": "$subject.assignedClasses" }
    ]
  }
}
```

## 4. Central Policy Evaluator
To ensure consistency across the HMAS (Hierarchical Multi-Agent System), all authorization checks are funneled through a singleton **Policy Evaluator**.

### Justification
1.  **Context Injection**: Automatically injects `tenant_id`, `user_id`, and `environment` (time, IP) into the evaluation context.
2.  **Auditability**: Every access decision is logged in the `role_assignments.metadata` or a dedicated audit bus for compliance.
3.  **Performance**: Policies are cached at the tenant level, allowing sub-millisecond evaluation without database hits on every request.
4.  **Agent Integration**: Level 4 Tool Agents rely on the evaluator to determine if they can execute a specific tool on behalf of a user.

## 5. Implementation Notes
- **Tenant Isolation**: Policies with `tenant_id = NULL` act as global system defaults, while tenant-specific policies override or append to the global set.
- **Conflicts**: If multiple policies apply, `deny` overrides `allow` by default (Safety-first approach).
- **Attribute Provisioning**: The evaluator requires a robust "Attribute Retriever" to fetch user/resource metadata (e.g., `assignedClasses`) before evaluation.

---

## Hono API Routes

```
Routes → PbacController → PbacService → PbacRepository → policyDefinitions/roleAssignments/policyBindings
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/policies` | List policy definitions | `TenantAdmin` |
| `POST` | `/api/v1/policies` | Create policy | `TenantAdmin` |
| `PATCH` | `/api/v1/policies/:id` | Update policy definition/priority | `TenantAdmin` |
| `DELETE` | `/api/v1/policies/:id` | Deactivate policy | `TenantAdmin` |
| `GET` | `/api/v1/roles` | List role assignments | `TenantAdmin` |
| `POST` | `/api/v1/roles` | Assign role to user | `TenantAdmin` |
| `POST` | `/api/v1/roles/:id/bind` | Bind policy to role assignment | `TenantAdmin` |
| `POST` | `/api/v1/evaluate` | Evaluate access (internal middleware) | Internal |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `policy_evaluator` | Task | Evaluates context against policy tree |
| `role_provisioner` | Task | Auto-assigns default roles on user creation |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `pbac.policy_created` | `{ policyId, tenantId, name }` | Events (audit) |
| `pbac.role_assigned` | `{ userId, roleName, tenantId }` | Events (audit), Core (user profile) |
| `pbac.access_denied` | `{ userId, resource, action }` | Events (security audit), Communication (alert admin) |
