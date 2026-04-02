# Frontend & Local-First Constraints

The EdApex frontend is a premium, local-first SPA built for professional users. You must strictly follow the `tanstack-react-db`, `ui-ux-pro-max`, and `web-artifacts-builder` skills to ensure visual excellence and operational reliability.

## 1. Technology Stack & Multi-Agent Authority
- **Routing & State**: Rely on `tanstack-start-best-practices`, `tanstack-query-best-practices`, and `tanstack-router-best-practices`.
- **Design Intelligence**: Use `ui-ux-pro-max` for curated palettes, typography, and chart scales.
- **Component Mastery**: Use `web-artifacts-builder` standards for complex Shadcn/Tailwind v4 assemblies.
- **Local-First Sync**: Use `tanstack-react-db` for reactive collection bindings (`useLiveQuery`).

| Technology | Purpose | Authority |
|:---|:---|:---|
| **React 19** | Core UI | React Standard |
| **TanStack Start** | Full-Stack SPA | `tanstack-start-best-practices` |
| **TanStack Query** | Data Fetching | `tanstack-query-best-practices` |
| **TanStack DB** | Local-First Engine | `tanstack-db-core` |
| **Tailwind v4** | Modern Styling | `ui-ux-pro-max` |
| **AI Elements** | AI Chat / Tools | `ai-elements` |

## 2. Premium Design System (WOW Factor)
As mandated by `ui-ux-pro-max`, EdApex must feel "premium and state-of-the-art".

- **Styling**: Leverage Tailwind v4 `@theme` (no `tailwind.config.ts`).
- **Aesthetics**: Use **Glassmorphism** (`--surface` glass panels), **Vibrant Gradients**, and **Subtle Micro-animations** (`rise-in`, `hover:scale-105`).
- **Typography**: `Manrope` (Sans) for data, `Fraunces` (Serif) for character roles and major headings.
- **Colors**: Use curated HSL palettes from `ui-ux-pro-max`. Avoid browser defaults.

```css
/* frontend/src/styles.css — Tailwind v4 Theme */
@theme {
  --color-primary: oklch(0.5 0.1 200); /* Sea Ink */
  --color-accent: oklch(0.7 0.2 180);  /* Lagoon */
  --shadow-premium: 0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 4px 18px -7px rgba(0, 0, 0, 0.05);
}
```

## 3. Local-First & TanStack DB Lifecycle
- **Collection-First**: Never fire `fetch()` in a component. All data must reside in a `db.collection`.
- **Reactive Hooks**: Use `useLiveQuery` for real-time reactivity.
- **Sync Reconciliation**: Every domain MUST implement a sync handler in `src/lib/sync.ts` that reconciles the D1 edge state with the local TanStack DB.

```tsx
// ✅ Correct: Live reactive binding
const { data: grades } = useLiveQuery(db.grades.from().where('tenant_id', '=', tenantId));
```

## 4. Complex Component Construction (`web-artifacts-builder`)
- **Shadcn UI**: Build complex dashboards by nesting Shadcn primitives with variant-based styling (CVA).
- **Interactive Shells**: Use `.island-shell` for isolated feature pods.
- **Lucide Icons**: Use `lucide-react` exclusively for professional glyphs.

## 5. AI Interface Excellence
- **AI-Elements**: Use standardized message, conversation, and tool-display components.
- **Notification System**: Use Sonner/Shadcn for immediate human feedback.
- **Agent Pulse Toasts**: Visualize granular agent heartbeats as low-priority "Ghost" notifications in the property panel (Right Pane).
- **Tool Progress**: Visually show agentic tool execution (PBAC check → Service Call → Result).
- **Streaming UI**: Always stream LLM responses for perceived speed.

## 6. Verification Checklist
- [ ] Light/Dark modes verified via `ui-ux-pro-max` contrast standards.
- [ ] All animations use `prefers-reduced-motion` guards.
- [ ] Sync logic tested with simulated offline-to-online transitions.
- [ ] Responsive layouts tested on mobile (320px) and ultrawide (1440px+).

