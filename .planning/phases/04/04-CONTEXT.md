# Phase 4: Command Center UI - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the 3-pane Command Center UI using TanStack Start, Tailwind v4, and AI-Elements. This phase delivers the primary user workspace, featuring real-time telemetry (Agent Pulse), atomic checkout streams, and a local-first WorkProduct gallery.

</domain>

<decisions>
## Implementation Decisions

### Layout & Navigation
- **D-01:** **Three-Pane Dashboard**:
    - **Sidebar (Left - 240px)**: Global Control, Scoping (Institutional/Personal), and navigation.
    - **Main Workspace (Center - Flex)**: AI-Elements chat + WorkProduct Gallery.
    - **Agent Pulse Panel (Right - 320px)**: Real-time telemetry and Checkout log.
- **D-02:** **Cmd+K Command Bar** (using `cmdk`) for global "Principal Intent" search and agent goal entry; keeps the sidebar clean.
- **D-03:** **WorkProduct Gallery**: Masonry grid layout for artifact review, while maintaining a standard vertical chat for the "Conversation" tab.

### Telemetry & SSE Pipeline
- **D-04:** **Aggregated Telemetry**: SSE heartbeats are throttled to "Per-thought" or "Per-action" cycles to reduce network chatter and enhance human readability in the Pulse pane.
- **D-05:** Real-time **Atomic Checkout** stream displaying cent-spend directly within the observability panel (instead of token count).
- **D-06:** **Alert Handlers**: High-priority Toast alerts for `ON_PBAC_VIOLATION` and `ON_COST_THRESHOLD_EXCEEDED` events.

### Local-First Sync & Conflict
- **D-07:** Integrated via **TanStack DB** with the following resolution rules:
    - **Financial Ledger**: Strict Transactional (`409 Conflict`). Requires re-fetch on collision.
    - **WorkProducts**: Semantic Merge or LWW.
    - **UI Preferences**: Last Write Wins (LWW).

### Visual Identity & UX
- **D-08:** **Component-Level Skeletons** using `boneyard-js` to maintain layout structure during data hydration.
- **D-09:** **Obsidian Theme**: Deep Obsidian (#0B0B0C) with "Kinetic Blue" primary accents.
- **D-10:** **Effects**: 12px backdrop blurs, `Refraction-Pro` hover effects, and 150ms smooth transitions for all UI states.

### the agent's Discretion
- Choice of specific icon set (Lucide vs. Phospor) for consistent visual language.
- Exact masonry column breakpoints for different screen sizes.

</decisions>

<canonical_refs>
## Canonical References

### UI/UX Design
- `docs/MASTER_ARCHITECTURE.md` §1 — High-level architecture and 3-pane concept.
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` §6 — Command Center specifications.
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` §11.1 — Kinetic Blue visual identity.

### Synchronization
- `docs/phases/02/02-CONTEXT.md` — TanStack DB sync decisions and `ssr: false` requirements.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tailwind.config.ts`: (To be updated for v4) Core color palette definitions.
- `src/components/ui/`: Existing Shadcn components to be extended with AI-Elements.

### Established Patterns
- **Transition Standards**: 150ms durations for all UI state changes.
- **Local Preference Persistence**: Sidebar collapse and tab positions are stored in `localOnly` collections.

### Integration Points
- `src/routes/__root.tsx`: The home for the 3-pane layout shell.

</code_context>

<deferred>
## Deferred Ideas

- Mobile-optimized tablet view (Phase 6).
- Voice-active intent entry — Post-V2 Backlog.

</deferred>

---

*Phase: 04-command-center-ui*
*Context gathered: 2026-04-09*
