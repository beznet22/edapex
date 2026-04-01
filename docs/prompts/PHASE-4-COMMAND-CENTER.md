# Phase 4 Implementation Prompt: Command Center UI (TanStack Start)

## 🎯 Objective
Build the **Command Center**—the stunning, keyboard-driven UI for the Agentic School. Your goal is to implement the local-first, AI-native SPA using **TanStack Start**, **Tailwind CSS v4**, and **AI-Elements**.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **LOCAL-FIRST**: Use **TanStack DB (IndexedDB)** as the primary source of truth for the client.
- **HONO RPC**: All backend interaction must use the type-safe Hono `hc` client.
- **GLASSMORPHISM**: Adhere to the "Refraction-Pro" design token (vibrant HSL palettes + smooth gradients).
- **MICRO-ANIMATIONS**: Hover transitions must be sub-150ms and butter-smooth.
- **TEST DRIVEN**: The agent MUST run and pass automated testing (unit/integration) before completing this phase.
- **GIT COMMIT**: The agent MUST create a standard git commit with AI attribution before signing out.
- **SCOPE LOCK**: Do NOT modify files or domains outside the explicit scope of this phase.
- **ESCALATION PROTOCOL**: If you encounter missing context, undocumented relations, or ambiguity, DO NOT HALLUCINATE. Pause and request clarification via `notify_user`.
- **STRICT TYPECHECK**: Run `pnpm tsc --noEmit` on all modified files. You must resolve all TypeScript errors before signing out.
- **EXECUTION PLAN**: Before writing code, you MUST create a localized `docs/plans/phase-4-command-center-plan.md` detailing the precise files you will create/modify.

## 📦 Required Context & Skills
- **Spec**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 35, Section 3).
- **UI Spec**: `ui-ux-pro-max` (For Shadcn/Tailwind v4 Glassmorphism).
- **Required Skills**:
  - `ui-ux-pro-max` (Glassmorphism design tokens)
  - `tanstack-start-best-practices` & `tanstack-router-best-practices`
  - `tanstack-react-db` & `tanstack-db-core` (Local-First IndexedDB state engine)
  - `ai-elements` (Chat component deployment)

## 🚀 Tasks

### 1. The Three-Pane Shell
Implement the responsive layout in the TanStack Start root.
- **Left Panel**: Navigation (Inbox, Domains, Logs).
- **Center Panel**: The Viewport (Chat, Artifact Viewer, Table Views).
- **Right Panel**: The Property Panel (Agent Pulse, Artifact Audit, Statistics).

### 2. Local-First Synchronization
Implement the reconciliation logic between **TanStack DB** and **Cloudflare D1**.
- Handle conflict resolution (Last-Write-Wins or custom domain logic).
- Ensure sub-1ms reactive updates to the UI when local data changes.

### 3. AI-Elements & WorkProduct Components
- Integrate the AI-Elements chat interface into the Center Panel.
- Implement **WorkProduct Thumbnails** with interactive "Preview" and "Audit" actions (Section 35.2 of the spec).

## 🏁 Completion Criteria
- [ ] Generated and followed a localized `docs/plans/phase-4-command-center-plan.md`.
- [ ] `pnpm tsc --noEmit` strictly passed with zero errors.
- [ ] Full 3-pane layout implementation (Tailwind CSS v4).
- [ ] Verified local-first sync between IndexedDB and D1/SQLite.
- [ ] Stunning aesthetics (Glassmorphism & Micro-animations).
- [ ] All automated tests passed.
- [ ] Code staged and committed with AI attribution.
- [ ] Update `docs/PROJECT_ROADMAP.md` (Phase 4 marked as COMPLETE).
