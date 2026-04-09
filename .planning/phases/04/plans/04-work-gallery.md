# Plan: WorkProduct Masonry Gallery

**Goal:** High-density, local-first artifact review experience.

## Proposed Changes

### Gallery
- [ ] **NEW** `src/components/gallery/MasonryGrid.tsx`: Flexible grid for WorkProduct cards.
- [ ] **Logic**: Bind to TanStack DB `collection('workProducts')`.
- [ ] **Visual**: 150ms hover transitions and "Refraction-Pro" effects.

### Detail View
- [ ] **MODIFY** `src/components/chat/ArtifactViewer.tsx`: Integrate with the masonry selection state.

## Verification
- [ ] Verify infinite masonry layout adjusts correctly to various card heights.
- [ ] Confirm instant local-first navigation between cards (no fetch delay).
