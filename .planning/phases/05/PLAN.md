# Phase 5: Academic Domain - Plan

**Objective:** Implement the core Academic domain features, including the immutable academic ledger, hierarchical curriculum engine, and specialized HMAS specialists.

## Acceptance Criteria (UAT)

- [ ] **Academic Ledger**: Every enrollment or grade change is recorded as an immutable event in the academic ledger.
- [ ] **Curriculum Hierarchy**: The system correctly enforces the `Dept > Course > Module > Lesson` hierarchy during curriculum creation.
- [ ] **Agentic Coordination**: The `AcademicSupervisor` can successfully delegate tasks to both the `CurriculumDesigner` and `EnrollmentCoordinator`.
- [ ] **Skill Mapping**: Lessons are correctly linked to skills, enabling skill-tree visualization in the Command Center.
- [ ] **Audit Trail**: Full historical playback of a student's academic progress is available via the ledger events.

## Implementation Steps

### 1. Student Records & Academic Ledger
- **Plan**: `plans/01-academic-ledger.md`
- **Focus**: Immutable event schema and enrollment toolset.

### 2. Hierarchical Curriculum Engine
- **Plan**: `plans/02-curriculum-engine.md`
- **Focus**: Course/Module modeling and skill-tree indexing.

### 3. Academic HMAS Specialists
- **Plan**: `plans/03-academic-specialists.md`
- **Focus**: Coordinator vs. Designer agent configurations.

---

*Phase: 05-academic-domain*
*Plan created: 2026-04-09*
