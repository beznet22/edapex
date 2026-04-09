# Plan: Cmd+K Command Bar & Navigation

**Goal:** Implement a clean, agentic entry point for system goals.

## Proposed Changes

### Search
- [ ] **Install**: `pnpm add cmdk`.
- [ ] **NEW** `src/components/layout/PrincipalSearchBar.tsx`: Floating command bar for intent entry.
- [ ] **Logic**: Map input to `PrincipalAgent.dispatch(intent)`.

### Navigation
- [ ] **NEW** `src/components/layout/Sidebar.tsx`: Glassmorphic links for Board, Ledgers, and Settings.

## Verification
- [ ] Cmd+K successfully toggles the search modal.
- [ ] Verify keyboard-driven navigation works as expected.
