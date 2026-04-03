# Documentation Requirements (The Gold Standard)

Every domain must have a "Gold Standard" specification in `docs/domains/[module].md`. As the architect, you are forbidden from implementing a feature if the domain spec lacks these sections:

1. **Overview & Persona**: Real-world professional role mapping.
2. **Entity Definitions**: Zod-validated schemas with UUID v7 and `tenant_id`.
3. **HMAS Agent Registry**: List of Supervisors, Agents, and Tools.
4. **API Manifest**: Hono RPC routes and PBAC constraints.
5. **Event Catalog**: Produced and Consumed events.
6. **Stress Defense Analysis**: Identification of stressors (Recursive loops, Storage quotas) and specific defense tools.
7. **Implementation Roadmap**: Checkpointed progress matching `PROJECT_ROADMAP.md`.
8. **HMAS Registry**: List of Executive, Supervisors, and Task Agents.
9. **Deployed Agent Skills**: A table mapping each agent to its required Hermes-style skills (`src/services/ai/skills/`).
10. **Tool Safety & Execution**: A table defining which tools require **Sidecar Isolation (Stress Lab)** vs. **Native Edge** execution, including their **Background Protocol** (`session_id`) requirement.
11. **Persistent Memory Registry**: A table mapping the `ai_memories` targets (`EXECUTIVE`, `DOMAIN`, `USER`) and their character budgets.

---

## 1. Lifecycle of a Specification
1. **Drafting**: Use the `multi-agent-brainstorming` skill to iterate on the design.
2. **Approval**: User must approve the spec before Phase 1 coding begins.
3. **Synchronization**: As code is written, update the "Implementation Roadmap" in the spec to `[x]`.

## 2. Project Roadmap Sync
Every completed task MUST be reflected in the top-level `PROJECT_ROADMAP.md`. If you finish a domain module, you must update the roadmap status to `COMPLETED`.

## 3. Style Guide
- Use GitHub alerts (`[!IMPORTANT]`, `[!WARNING]`) for critical edge-native constraints.
- Use Mermaid diagrams for HMAS orchestration flows.
- Reference neighbor skills (e.g., `api-patterns`) for design justification.

## 3. Master Architecture Tracking
If a completely new layer concept or global feature is introduced:
Every API endpoint constructed in the `controllers/` layer MUST be logged in the Route definitions table of its respective domain documentation, complete with its Authorization/Tenant requirement.

## 5. Domain Event Registration
Every new domain event MUST be documented in the "Domain Events" section of the domain spec, including:
- Event name (e.g., `finance.payment_received`)
- Payload shape
- Consumer domains

