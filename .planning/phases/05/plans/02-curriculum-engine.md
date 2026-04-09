# Plan: Hierarchical Curriculum Engine

**Goal:** Implement the complex academic content hierarchy.

## Proposed Changes

### Curriculum modeling
- [ ] **NEW** `src/db/sqlite/curriculum.ts`: Tables for `departments`, `courses`, `modules`, and `lessons`.
- [ ] **Constraints**: Foreign key enforcement for the fixed hierarchy.

### Skill Mapping
- [ ] **NEW** `src/services/academic/SkillManager.ts`: Mapslessons to specific competency tags.

### Designer Tools
- [ ] **NEW** `src/services/ai/skills/curriculum/tools.ts`: Tools for `draftSyllabus`, `addLesson`, and `publishModule`.

## Verification
- [ ] Confirm valid path resolution: `Dept > Course > Module > Lesson`.
- [ ] Verify that skill-mapping updates correctly index new lessons for agent discovery.
