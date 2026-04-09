# Plan: Staff HMAS Specialists

**Goal:** Specialized agents for HR and Operations coordination.

## Proposed Changes

### Supervisor
- [ ] **NEW** `src/services/ai/skills/supervisors/StaffSupervisor.ts`: Coordinates operations and personnel tasks.

### Personas
- [ ] **NEW** `src/services/ai/skills/staff/HRManagerAgent.ts`: Persona specializing in compliance and payroll.
- [ ] **NEW** `src/services/ai/skills/staff/OpsManagerAgent.ts`: Persona specializing in facility uptime and supply chain.

## Verification
- [ ] Mock personal goal (e.g., "Change my direct deposit") and verify delegation to HR.
- [ ] Mock operational goal (e.g., "The projector in Room 10 is broken") and verify delegation to Ops.
