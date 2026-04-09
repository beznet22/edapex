# Plan: Academic HMAS Specialists

**Goal:** Configure the hierarchical agents for academic orchestration.

## Proposed Changes

### Supervisor
- [ ] **NEW** `src/services/ai/skills/supervisors/AcademicSupervisor.ts`: Multi-agent entry point for academic goals.

### Specialized Agents
- [ ] **NEW** `src/services/ai/skills/academic/EnrollmentCoordinator.ts`: Persona focused on administrative strictness.
- [ ] **NEW** `src/services/ai/skills/academic/CurriculumDesigner.ts`: Persona focused on pedagogical structure and skill mapping.

## Verification
- [ ] Mock academic goal and verify the Supervisor correctly delegates to the appropriate specialist.
- [ ] Confirm no cross-talk of tools (Designer should not have unenrollment permissions).
