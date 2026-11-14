# 10 — Capabilities and Roles

**Implemented in 10A:** `GET /api/v1/agent/capabilities`, shared `@edapex/contracts`, and the admin issue plan/apply contract. Public applicant forms remain contract-only until 10E.

## Roles

Roles are **tenant-defined**. The school four are the shipped default for the `edapex-school` pack, not a closed platform set.

| Role | v1 access |
|---|---|
| Public applicant | Applications, drafts, status; no active account |
| Parent | Own children read; profile; published reports; no school writes |
| Student | Own records read; published reports; no school writes |
| Teacher | Own class roster, attendance, marks, feedback, report review/publish where authorized |
| Admin | People, admissions, enrollment, staffing, promotion/transfer, settings, issues |
| Super admin | Bootstrap, migration, sessions, archive, tokens |
| Accountant/Receptionist/Librarian/Driver/Others | Only capabilities explicitly implemented; no invented agent tools |

Agent permissions never exceed the authenticated user's permissions. The server enforces roles; the browser/LLM does not.

### Tenant-defined role set

`CAPABILITY_ROLES` is a role set supplied by the tenant package, with `admin`, `teacher`, `parent`, `student` as the default. It is enforced in `packages/contracts/src/capabilities.ts`.

- A role the active pack does not define resolves to **zero tools**. It never falls back to the union of packs.
- A pack that declares no entry for a role is valid, not an error; the manifest for that role is empty.
- `validateAllRolePacks` validates every pack against the role set it declares and against the 5/8 budget. It is a CI gate.

A tenant that is not a school enables no first-party pack and relies on connectors (`10` §Non-school tenants). A tenant with its own system ships its own typed pack over its own API; it does not get a generic pack-authoring SDK.

### Non-school tenants

EdApex Cowork is the platform; `edapex-school` is the first pack. Three tiers exist:

| Tier | Usage | Requirement |
|---|---|---|
| 1 — Platform only | Agents, skills, routines and connectors over an empty tenant; no first-party pack | Role capability resolution must not require a school tenant scope (`academicId`) |
| 2 — Own first-party pack | A typed pack over the business's own API | Tenant-defined role set (above) |
| 3 — Their systems as connectors | Governed MCP with per-agent grants | No platform change; see `60-security-privacy.md` |

Tier 1 means the role capability endpoint cannot sit behind school tenant middleware. A user with no school scope must still resolve a role and receive an empty-but-valid manifest.

## Agents and grants

A capability pack is a **ceiling**. An agent is a **selection inside** it. Agents never extend the catalogue.

| Axis | Question | Type |
|---|---|---|
| Ceiling | What operations may exist for this role here? | `CapabilityPack` / `CapabilityTool` / `CapabilityOperation` |
| Scope | Which feature areas are enabled for this tenant? | `TenantFeature` |
| Grant | Which of those may this agent call? | `AgentGrant` |
| Invocation | How is it invoked? | `skills` + `skill_tools` |

### Narrowing invariant

An agent's effective grants must be a subset of its creator's ceiling at creation time and at every mutation:

```text
agent.effectiveGrant ⊆ capabilityManifest(creator.role, features).packs[*].tools[*].operations
```

- An agent may only narrow. It may never introduce an operation, a tool, or a role.
- Re-validate on every grant write and at turn execution. A role change or feature disable that shrinks the ceiling shrinks every dependent agent's effective grant.
- A grant that no longer resolves is dropped, not silently widened.
- Remote agents (`kind: remote`, AG-UI endpoints) require explicit admin approval. Their grant set is never derived from the creator.

Without this invariant, agent creation is privilege escalation: a teacher creates an agent, grants it an admin operation, and holds admin authority through a proxy.

### Per-agent tool budget

A user-created agent carries its own `CapabilityManifest` scope (optional `agentId`), drawn from the creator's ceiling and held to the same limits: **max 5 tools, max 8 operations per tool**. Filter tenant features **before** applying the tool cap.

### Agent creation is plan-then-apply

Minting an agent is a permission change and follows the same discipline as every other high-impact action:

1. The agent is **proposed** with a name, purpose, model, channel and a candidate grant set.
2. The server resolves the candidate grants against the creator's ceiling and reports anything that would exceed it. It does not silently trim.
3. The person **applies** explicitly. There is no auto-apply and no inferred approval.
4. The applied agent carries a server-issued record: creator, grant set, and the ceiling snapshot it was validated against.

`agents.yaml` in the tenant package seeds the shipped Bots. Those rows are non-deletable and are re-validated on every package load. The `agents` table holds the mutable, user-created set. Both feed one registry.

## Capability groups

- `people`: students, parents, staff, profiles, status, guardian links
- `academics`: classes, sections, subjects, routines, staffing, promotion/transfer
- `assessment`: marksheets, feedback, report cards, transcripts
- `attendance`: class/student attendance
- `admissions`: public applications, review, offers, enrollment
- `admin_issues`: unplaced/no-current, unstaffed sections, shared emails, missing records, mismatches
- `workspace`: files, workflows, shell, code sandbox
- `public_forms`: application/signup forms, not agent tools

## Capability registry

Every capability declares:

```text
id, version, domain, description
allowedRoles, risk(read|write|destructive)
approval(required|none), idempotent
scope(school|class|self), inputSchema, outputSchema
toolPack, enabled, deprecation
```

The server exposes only the authenticated user's manifest. The UI loads only the current role/context pack.

## Tool budget

- Max **5 tools** per role/turn.
- Max **8 operations** per tool.
- Descriptions short; no full API docs in the model context.
- Public forms are not agent tools.
- Admin issues are one domain tool with plan/apply, not one tool per student.
- CI rejects packs over budget.
- GenUI presentation is not a capability/tool; it is a typed output shape. It does not add a sixth tool or change the 8-operation limit.
- Telemetry prunes unused capabilities.
- Tenant features filter the tool set **before** the 5-tool cap is applied, so a disabled area can never consume a slot.
- An agent's own manifest is held to the same 5/8 limits and is always a subset of its creator's ceiling.

## Existing vs missing

The API currently has roughly 98 unique path literals. Existing coverage includes auth, students, staffing, promotion, attendance, assessments, reports, archives, settings and migration. Missing for v1 planning include public applications, enrollment, staff registration, class/section CRUD, transfer/graduation, unified admin issues and the workspace tools.

Phase 10 builds only the capabilities needed for the v1 slices; not all endpoints.
