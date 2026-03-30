# Documentation Compliance

If it is not documented, it does not exist. You MUST finalize your workflow by updating the master documentation precisely.

## 1. Domain-Specific Documentation Updates
Whenever a new schema, API route, or AI agent is deployed, you must update the markdown specification in `docs/domains/[module].md`.
- Ensure the documentation accurately reflects the multi-dialect DB schema logic.
- Ensure the documentation lists the ReAct tools mapped to the new Agents.
- Ensure the new PBAC (Policy-Based Access Control) rules are clearly defined.

## 2. Master Architecture Tracking
If a completely new layer concept or global feature is introduced:
- You must append to `docs/MASTER_ARCHITECTURE.md` to ensure the blueprint map remains entirely accurate.

## 3. API Route Generation
Every API endpoint constructed in the `controllers/` layer MUST be logged in the Route definitions table of its respective domain documentation, complete with its Authorization/Tenant requirement.
