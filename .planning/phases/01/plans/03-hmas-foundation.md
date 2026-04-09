# Plan: HMAS Foundation

**Goal:** Establish the hierarchical agent orchestration and skill discovery.
**Status:** Completed (Retroactive)

## Proposed Changes

### Orchestration
- [x] **Structure**: Create `src/services/ai/skills/supervisors/`.
- [x] **Discovery**: Implement `registry.ts` to transform `SKILL.md` into Mastra Tool specifications.
- [x] **Persona**: Define the `Principal` strategy in `SOUL.md`.

## Verification
- [x] Verify skill registry correctly parses metadata from filesystem.
