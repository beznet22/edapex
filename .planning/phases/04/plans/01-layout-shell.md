# Plan: 3-Pane Layout Shell

**Goal:** Establish the obsidian-themed, edge-native dashboard foundation.

## Proposed Changes

### Styling
- [ ] **MODIFY** `tailwind.config.ts`: Add "Kinetic Blue" (#3B82F6) and "Deep Obsidian" (#0B0B0C) tokens.
- [ ] **MODIFY** `src/index.css`: Implement global backdrop-blur and glassmorphism utilities.

### Layout
- [ ] **MODIFY** `src/routes/__root.tsx`: Implement the 3-pane structure (Sidebar/Main/Pulse) using flexbox.
- [ ] **NEW** `src/components/ui/GhostSkeletons.tsx`: Component-level loading states via `boneyard-js`.

## Verification
- [ ] Visual audit of responsive layout (Desktop/Tablet).
- [ ] Verify 12px backdrop blur on glassmorphic elements.
