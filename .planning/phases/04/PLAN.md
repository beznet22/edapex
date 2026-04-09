# Phase 4: Command Center UI - Plan

**Objective:** Implement the 3-pane Command Center UI using TanStack Start, Tailwind v4, Shadcn UI, and AI-Elements.

## Acceptance Criteria (UAT)

- [ ] **Visceral Shell**: The 3-pane layout (Sidebar, Main, Pulse) is responsive and follows the Obsidian/Kinetic Blue theme.
- [ ] **Agentic Search**: Cmd+K command bar opens, allows intent entry, and routes to the Principal arbiter.
- [ ] **Real-time Observability**: The Agent Pulse panel receives and displays SSE heartbeats at an aggregated (per-thought) frequency.
- [ ] **Financial Transparency**: Atomic Checkout log displays real-time cent-spend for each agent action.
- [ ] **Work Gallery**: The WorkProduct tab displays artifacts in a clean masonry grid with 150ms transitions.
- [ ] **Smooth Hydration**: `boneyard-js` skeletons prevent layout shift during local-first data loading.

## Implementation Steps

### 1. 3-Pane Layout Shell
- **Plan**: `plans/01-layout-shell.md`
- **Focus**: Tailwind v4 setup, Hono route layout, and boneyard skeletons.

### 2. Cmd+K Search & Navigation
- **Plan**: `plans/02-cmd-k-search.md`
- **Focus**: Principal intent input and sidebar scoping.

### 3. Agent Pulse Telemetry
- **Plan**: `plans/03-agent-pulse.md`
- **Focus**: SSE pipeline integration and checkout stream.

### 4. WorkProduct Masonry Gallery
- **Plan**: `plans/04-work-gallery.md`
- **Focus**: Grid layout for artifacts and masonry view.

---

*Phase: 04-command-center-ui*
*Plan created: 2026-04-09*
